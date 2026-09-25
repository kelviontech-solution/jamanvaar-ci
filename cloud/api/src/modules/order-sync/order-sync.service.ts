import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Device, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { nextSyncSequence } from '../../common/sync-sequence';
import { mergeOrderItems } from './order-merge';
import { RealtimeBus } from '../../common/realtime/realtime-bus';
import { OrderSyncEventDto, orderSyncEventSchema } from './dto/push-order-sync.dto';

const CATCH_UP_DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000; // 24h
const CATCH_UP_MAX_ROWS = 500;

/**
 * security-audit HIGH-05: once an order's payment has actually settled or been refunded,
 * that fact must not be silently reversible by a stale or malicious push from a
 * kitchen/floor device — see the guard in `pushEvents` below.
 */
const TERMINAL_PAID_STATUSES: ReadonlySet<string> = new Set(['SUCCESS', 'REFUNDED']);
/** Device types with real payment/refund authority — the only ones allowed to change a terminal payment status. */
const PAYMENT_AUTHORITATIVE_DEVICE_TYPES: ReadonlySet<string> = new Set(['POS', 'POS_ADMIN']);

export interface OrderSyncPushResult {
  externalOrderId: string;
  status: 'ok' | 'error';
  syncVersion?: number;
  /** True when this eventId was already applied: nothing changed, the original outcome is returned. */
  duplicate?: boolean;
  error?: string;
}

type TxClient = Prisma.TransactionClient;


function transactionIdOf(meta: unknown): string | undefined {
  const id = meta && typeof meta === 'object' ? (meta as { paymentTransactionId?: unknown }).paymentTransactionId : undefined;
  return typeof id === 'string' && id ? id : undefined;
}

/** The single place that decides whether a push may change an order's payment state. Null means allowed. */
function paymentViolation(
  existing: { paymentStatus: string | null; deviceId: string | null; meta: unknown },
  evt: OrderSyncEventDto,
  device: Device
): { code: string; message: string } | null {
  if (!existing.paymentStatus || !TERMINAL_PAID_STATUSES.has(existing.paymentStatus)) return null;
  if (evt.paymentStatus === undefined || evt.paymentStatus === existing.paymentStatus) {
    const paidWith = transactionIdOf(existing.meta);
    const incoming = transactionIdOf(evt.meta);
    if (existing.paymentStatus === 'SUCCESS' && paidWith && incoming && paidWith !== incoming) {
      return { code: 'ORDER_ALREADY_PAID', message: 'This order was already paid by another transaction' };
    }
    return null;
  }
  if (existing.paymentStatus === 'SUCCESS' && evt.paymentStatus === 'REFUNDED') {
    const mayRefund = PAYMENT_AUTHORITATIVE_DEVICE_TYPES.has(device.type) || existing.deviceId === device.id;
    return mayRefund ? null : { code: 'REFUND_NOT_AUTHORIZED', message: 'This device cannot refund a payment it did not record' };
  }
  return { code: 'PAYMENT_STATUS_FINAL', message: 'A settled order cannot go back to an unpaid state' };
}

@Injectable()
export class OrderSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeBus
  ) {}

  /**
   * Upserts each event by (restaurantId, externalOrderId) — the local app's
   * own order id is the idempotency key, so a retried push after a dropped
   * response (the exact failure mode BUG-009 traced to) never double-creates
   * a row, it just re-applies the same state.
   */
  async pushEvents(device: Device, rawEvents: unknown[]): Promise<{ results: OrderSyncPushResult[]; serverTime: string }> {
    const results: OrderSyncPushResult[] = [];
    let latestSeq: number | undefined;

    await this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      for (const raw of rawEvents) {
        const startedAt = Date.now();
        const parsed = orderSyncEventSchema.safeParse(raw);
        if (!parsed.success) {
          const id =
            raw && typeof raw === 'object' && typeof (raw as { externalOrderId?: unknown }).externalOrderId === 'string'
              ? (raw as { externalOrderId: string }).externalOrderId
              : 'unknown';
          const problem = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ').slice(0, 500);
          await tx.syncEventLog.create({
            data: {
              restaurantId: device.restaurantId,
              deviceId: device.id,
              entityType: 'ORDER',
              action: 'UPDATE',
              status: 'FAILED',
              latencyMs: Date.now() - startedAt,
              payloadSize: JSON.stringify(raw ?? null).length,
              errorMessage: `Invalid order payload: ${problem}`
            }
          });
          results.push({ externalOrderId: id, status: 'error', error: `Invalid order payload: ${problem}` });
          continue;
        }
        const evt: OrderSyncEventDto = parsed.data;
        let claimed = false;
        try {
          // Exactly-once: claim the eventId first. If it was already claimed, answer from the recorded
          // outcome and change nothing, so a retry after a lost response (or a delayed replay of an
          // older event) can never re-apply.
          if (evt.eventId) {
            const claim = await tx.$executeRaw`
              INSERT INTO "ProcessedSyncEvent" ("id", "restaurantId", "eventId", "deviceId", "entityType", "entityId", "result")
              VALUES (${randomUUID()}, ${device.restaurantId}, ${evt.eventId}, ${device.id}, 'ORDER', ${evt.externalOrderId}, '{}'::jsonb)
              ON CONFLICT ("restaurantId", "eventId") DO NOTHING`;
            if (claim === 0) {
              const prior = await tx.processedSyncEvent.findUnique({
                where: { restaurantId_eventId: { restaurantId: device.restaurantId, eventId: evt.eventId } }
              });
              const priorResult = (prior?.result ?? {}) as { syncVersion?: number };
              results.push({ externalOrderId: evt.externalOrderId, status: 'ok', syncVersion: priorResult.syncVersion, duplicate: true });
              continue;
            }
            claimed = true;
          }
          const existing = await tx.syncedOrder.findUnique({
            where: { restaurantId_externalOrderId: { restaurantId: device.restaurantId, externalOrderId: evt.externalOrderId } }
          });

          // A settled payment is a business invariant, not an ordinary sync conflict: one order is paid
          // once, a paid order can be refunded but never silently reopened, and only a device with
          // payment authority may refund. Violations are refused and recorded, never applied.
          const violation = existing ? paymentViolation(existing, evt, device) : null;
          if (existing && violation) {
            await tx.syncConflict.create({
              data: {
                restaurantId: device.restaurantId,
                branchId: device.branchId,
                deviceId: device.id,
                entityType: 'ORDER',
                entityId: evt.externalOrderId,
                localVersion: evt as any,
                cloudVersion: { paymentStatus: existing.paymentStatus, totalAmount: existing.totalAmount, status: existing.status, meta: existing.meta } as any,
                reason: `${violation.code}: ${device.type} device sent paymentStatus ${evt.paymentStatus} on an order already ${existing.paymentStatus}`
              }
            });
            if (claimed) await this.releaseClaim(tx, device.restaurantId, evt.eventId!);
            results.push({ externalOrderId: evt.externalOrderId, status: 'error', error: `${violation.code}: ${violation.message}` });
            continue;
          }

          // Items are merged per originating device so POS and Captain adding to one order never erase
          // each other, and kitchen progress never regresses. Totals stay as the pushing device computed
          // them (money is never silently recomputed); if other devices' items were kept, flag for review.
          const merge = mergeOrderItems((existing?.items as any[] | undefined) ?? undefined, evt.items as any[], device.id);
          const mergedMeta = merge.foreignItemsKept ? { ...((evt.meta as object) ?? {}), needsTotalsReview: true } : evt.meta;

          const data = {
            restaurantId: device.restaurantId,
            deviceId: device.id,
            externalOrderId: evt.externalOrderId,
            orderType: evt.orderType,
            status: evt.status,
            tableId: evt.tableId,
            tableLabel: evt.tableLabel,
            items: merge.items as any,
            subtotal: evt.subtotal,
            taxAmount: evt.taxAmount,
            discountAmount: evt.discountAmount,
            totalAmount: evt.totalAmount,
            notes: evt.notes,
            paymentStatus: evt.paymentStatus,
            paymentMethod: evt.paymentMethod,
            meta: (mergedMeta ?? undefined) as any
          };

          const seq = await nextSyncSequence(tx, device.restaurantId);
          latestSeq = seq;
          const saved = existing
            ? await tx.syncedOrder.update({
                where: { id: existing.id },
                data: { ...data, syncVersion: existing.syncVersion + 1, seq }
              })
            // The order belongs to the branch of the terminal that first pushed it (BUG-048).
            : await tx.syncedOrder.create({ data: { ...data, branchId: device.branchId, syncVersion: 1, seq } });

          await tx.syncEventLog.create({
            data: {
              restaurantId: device.restaurantId,
              deviceId: device.id,
              entityType: 'ORDER',
              entityId: evt.externalOrderId,
              traceId: evt.traceId ?? evt.externalOrderId,
              eventId: evt.eventId,
              action: existing ? 'UPDATE' : 'CREATE',
              status: 'SUCCESS',
              latencyMs: Date.now() - startedAt,
              payloadSize: JSON.stringify(evt).length
            }
          });

          if (claimed) {
            await tx.processedSyncEvent.update({
              where: { restaurantId_eventId: { restaurantId: device.restaurantId, eventId: evt.eventId! } },
              data: { result: { syncVersion: saved.syncVersion, seq } }
            });
          }
          results.push({ externalOrderId: evt.externalOrderId, status: 'ok', syncVersion: saved.syncVersion });
        } catch (err: any) {
          if (claimed) await this.releaseClaim(tx, device.restaurantId, evt.eventId!);
          await tx.syncEventLog.create({
            data: {
              restaurantId: device.restaurantId,
              deviceId: device.id,
              entityType: 'ORDER',
              entityId: evt.externalOrderId,
              traceId: evt.traceId ?? evt.externalOrderId,
              eventId: evt.eventId,
              action: 'UPDATE',
              status: 'FAILED',
              latencyMs: Date.now() - startedAt,
              payloadSize: JSON.stringify(evt).length,
              errorMessage: err?.message?.slice(0, 500) ?? 'Unknown error'
            }
          });
          results.push({ externalOrderId: evt.externalOrderId, status: 'error', error: err?.message ?? 'Unknown error' });
        }
      }
    });

    // Wake the branch only after the transaction has committed, so a woken device's pull always sees the change.
    if (results.some((r) => r.status === 'ok' && !r.duplicate)) {
      this.realtime.publish({ restaurantId: device.restaurantId, branchId: device.branchId, kind: 'orders', seq: latestSeq, originDeviceId: device.id });
    }
    return { results, serverTime: new Date().toISOString() };
  }

  /** A failed event must stay retryable, so its claim is dropped rather than recorded as applied. */
  private async releaseClaim(tx: TxClient, restaurantId: string, eventId: string) {
    await tx.processedSyncEvent.deleteMany({ where: { restaurantId, eventId } }).catch(() => undefined);
  }

  /**
   * Catch-up/replay pull for a (re)connecting device — not just a live push
   * target. `since` is the cursor the device persisted from a prior call's
   * `serverTime`, so a device that was offline for hours gets everything it
   * missed in one shot rather than only future pushes.
   */
  async catchUp(device: Device, since?: string, afterSeq?: number) {
    const branchFilter = device.branchId ? { OR: [{ branchId: device.branchId }, { branchId: null }] } : {};

    // Sequence cursor (preferred): strictly increasing, gapless, independent of any clock.
    if (afterSeq !== undefined) {
      const rows = await this.prisma.runAsTenant(device.restaurantId, (tx) =>
        tx.syncedOrder.findMany({
          where: { restaurantId: device.restaurantId, seq: { gt: afterSeq }, ...branchFilter },
          orderBy: { seq: 'asc' },
          take: CATCH_UP_MAX_ROWS + 1
        })
      );
      const hasMore = rows.length > CATCH_UP_MAX_ROWS;
      const orders = hasMore ? rows.slice(0, CATCH_UP_MAX_ROWS) : rows;
      const latestSeq = orders.length > 0 ? (orders[orders.length - 1].seq as number) : afterSeq;
      return { orders, latestSeq, hasMore, serverTime: new Date().toISOString() };
    }

    // Legacy timestamp cursor, kept for app versions that predate the sequence.
    const sinceDate = since ? new Date(since) : new Date(Date.now() - CATCH_UP_DEFAULT_LOOKBACK_MS);
    const orders = await this.prisma.runAsTenant(device.restaurantId, (tx) =>
      tx.syncedOrder.findMany({
        where: { restaurantId: device.restaurantId, updatedAt: { gt: sinceDate }, ...branchFilter },
        orderBy: { updatedAt: 'asc' },
        take: CATCH_UP_MAX_ROWS
      })
    );
    const latestSeq = orders.reduce((max, o) => Math.max(max, o.seq ?? 0), 0);
    return { orders, latestSeq, serverTime: new Date().toISOString() };
  }
}
