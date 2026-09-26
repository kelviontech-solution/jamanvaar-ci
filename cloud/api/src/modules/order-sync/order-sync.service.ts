import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Device, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { nextSyncSequence } from '../../common/sync-sequence';
import { mergeOrderItems } from './order-merge';
import { decideStatus, integrityFlags } from './order-rules';
import { RealtimeBus } from '../../common/realtime/realtime-bus';
import { AuditService } from '../audit/audit.service';
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


/** The channel an order came from, recorded once at creation and never changed by later pushes. */
export function orderSourceFor(deviceType: string, meta: unknown): string {
  const declared = meta && typeof meta === 'object' ? (meta as { sourceType?: unknown }).sourceType : undefined;
  if (declared === 'QR_TABLE') return 'QR';
  if (declared === 'KIOSK' || declared === 'CAPTAIN' || declared === 'POS' || declared === 'ONLINE') return declared;
  if (deviceType === 'KIOSK' || deviceType === 'CAPTAIN') return deviceType;
  return 'POS';
}

export interface ServerOrderInput {
  restaurantId: string;
  branchId: string | null;
  externalOrderId: string;
  source: string;
  publicOrderId?: string;
  qrCodeId?: string;
  /** The published menu version the order was priced from. */
  menuVersion?: number;
  orderType: string;
  status: string;
  tableId?: string | null;
  tableLabel?: string | null;
  items: unknown[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  notes?: string | null;
  paymentStatus: string;
  paymentMethod: string;
  meta: Record<string, unknown>;
  /** Runs inside the same transaction, after the order is locked and known not to exist yet; throw to refuse. */
  beforeCreate?: (tx: TxClient) => Promise<Record<string, unknown> | void>;
  /** Take the restaurant-wide QR lock so a daily limit cannot be overshot by concurrent submits. */
  serializeRestaurantLimit?: boolean;
}

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
    private readonly realtime: RealtimeBus,
    private readonly audit: AuditService
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
      // Serialise writers of the same order. Two devices creating or updating one order at once used to
      // race (both see "no such order", one create then fails and aborts the whole transaction). Locks are
      // taken up front in sorted order, before the sequence counter is touched, so two batches can never
      // wait on each other in a cycle.
      const orderIds = new Set<string>();
      for (const raw of rawEvents) {
        const id = raw && typeof raw === 'object' ? (raw as { externalOrderId?: unknown }).externalOrderId : undefined;
        if (typeof id === 'string' && id) orderIds.add(id);
      }
      for (const id of [...orderIds].sort()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'order:' + device.restaurantId + ':' + id}))`;
      }

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
        // A database error inside one event must not poison the transaction for the rest of the batch.
        await tx.$executeRaw`SAVEPOINT order_event`;
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
          // Meta is merged key by key: a push that omits a key (a KDS status update has no payment reference)
          // must never erase what another device recorded, such as the payment transaction id.
          const priorMeta = (existing?.meta as Record<string, unknown> | null) ?? {};
          const incomingMeta = (evt.meta as Record<string, unknown> | undefined) ?? {};
          const mergedMeta: Record<string, unknown> | undefined =
            existing || evt.meta || merge.foreignItemsKept
              ? { ...priorMeta, ...incomingMeta, ...(merge.foreignItemsKept ? { needsTotalsReview: true } : {}) }
              : undefined;
          // Accepting an order is a claim: the first device to record it owns it, and a later claim cannot take it over.
          if (mergedMeta && typeof priorMeta.acceptedBy === 'string') mergedMeta.acceptedBy = priorMeta.acceptedBy;

          // The order's state follows rules, not arrival order: no going backwards, no leaving a terminal state, and a device
          // type only sets the states it has authority over. A refused change is recorded; the rest of the push still merges.
          const decision = decideStatus(existing?.status, evt.status, device.type, evt.meta as { statusCorrection?: unknown } | undefined);
          if (!decision.apply) {
            await tx.syncConflict.create({
              data: {
                restaurantId: device.restaurantId, branchId: device.branchId, deviceId: device.id, entityType: 'ORDER', entityId: evt.externalOrderId,
                localVersion: { status: evt.status, updatedAt: evt.updatedAt } as any, cloudVersion: { status: existing?.status } as any,
                reason: `${decision.reason}: ${decision.message}`
              }
            });
          }

          // A push based on an older version of the order must not overwrite header fields another device has since changed.
          const staleHeader = !!existing && evt.baseSyncVersion !== undefined && evt.baseSyncVersion < existing.syncVersion;
          if (staleHeader) {
            await tx.syncConflict.create({
              data: {
                restaurantId: device.restaurantId, branchId: device.branchId, deviceId: device.id, entityType: 'ORDER', entityId: evt.externalOrderId,
                localVersion: { baseSyncVersion: evt.baseSyncVersion, totalAmount: evt.totalAmount, tableId: evt.tableId } as any,
                cloudVersion: { syncVersion: existing!.syncVersion, totalAmount: existing!.totalAmount, tableId: existing!.tableId } as any,
                reason: `STALE_HEADER: ${device.type} pushed against version ${evt.baseSyncVersion}, the order is at ${existing!.syncVersion}; its totals, table and notes were kept as they were`
              }
            });
          }
          const header = staleHeader && existing
            ? { orderType: existing.orderType, tableId: existing.tableId, tableLabel: existing.tableLabel, subtotal: existing.subtotal, taxAmount: existing.taxAmount, discountAmount: existing.discountAmount, totalAmount: existing.totalAmount, notes: existing.notes }
            : { orderType: evt.orderType, tableId: evt.tableId, tableLabel: evt.tableLabel, subtotal: evt.subtotal, taxAmount: evt.taxAmount, discountAmount: evt.discountAmount, totalAmount: evt.totalAmount, notes: evt.notes };

          // Device-priced orders are believed (devices work offline on an older menu) but checked; problems are flagged, never rejected.
          let reviewFlags: string[] = [];
          if (!existing) {
            const ids = (evt.items as Array<{ externalItemId: string }>).map((i) => i.externalItemId);
            const menuRows = await tx.syncedEntity.findMany({ where: { restaurantId: device.restaurantId, entityType: 'MENU_ITEM', externalId: { in: ids } }, select: { externalId: true, payload: true } });
            const base = new Map<string, number>();
            for (const r of menuRows) {
              const p = r.payload as { price?: unknown; deleted?: unknown } | null;
              if (p && p.deleted !== true && typeof p.price === 'number') base.set(r.externalId, Math.round(p.price * 100));
            }
            reviewFlags = integrityFlags(evt.items as any[], evt.subtotal, base);
            if (reviewFlags.length > 0) {
              await tx.syncConflict.create({
                data: {
                  restaurantId: device.restaurantId, branchId: device.branchId, deviceId: device.id, entityType: 'ORDER', entityId: evt.externalOrderId,
                  localVersion: { subtotal: evt.subtotal, totalAmount: evt.totalAmount } as any, cloudVersion: {} as any,
                  reason: `PRICE_REVIEW: ${reviewFlags.slice(0, 6).join('; ')}`
                }
              });
            }
          }
          // Server-owned facts about the order live in meta and cannot be set by a device: who created it, and what needs review.
          const serverMeta: Record<string, unknown> = {
            originDeviceId: (priorMeta.originDeviceId as string | undefined) ?? device.id,
            ...(reviewFlags.length > 0 ? { reviewFlags } : {}),
            ...(staleHeader ? { needsTotalsReview: true } : {})
          };
          const finalMeta = { ...(mergedMeta ?? {}), ...serverMeta, ...(existing && Array.isArray(priorMeta.reviewFlags) && reviewFlags.length === 0 ? { reviewFlags: priorMeta.reviewFlags } : {}) };
          delete (finalMeta as Record<string, unknown>).statusCorrection;

          // Only the counter (POS, POS Admin) may declare an order paid or refunded. Any other terminal may report a payment only when it
          // points at a settled gateway transaction of this restaurant that covers the total; otherwise the order keeps its payment
          // state (or starts unpaid) and the attempt is recorded. This is what stops a kiosk, kitchen screen or Captain from inserting
          // "paid" sales that no money stands behind.
          let payStatus = evt.paymentStatus;
          if (payStatus && !PAYMENT_AUTHORITATIVE_DEVICE_TYPES.has(device.type) && payStatus !== existing?.paymentStatus && TERMINAL_PAID_STATUSES.has(payStatus)) {
            const ref = (evt.meta as { paymentTransactionId?: string } | undefined)?.paymentTransactionId;
            const settled = payStatus === 'SUCCESS' && ref
              ? await tx.paymentTransaction.findFirst({
                  where: { restaurantId: device.restaurantId, status: 'SUCCESS', OR: [{ id: ref }, { providerOrderId: ref }, { providerPaymentId: ref }] },
                  select: { amount: true }
                })
              : null;
            if (!settled || settled.amount < evt.totalAmount) {
              await tx.syncConflict.create({
                data: {
                  restaurantId: device.restaurantId, branchId: device.branchId, deviceId: device.id, entityType: 'ORDER', entityId: evt.externalOrderId,
                  localVersion: { paymentStatus: payStatus, totalAmount: evt.totalAmount, paymentTransactionId: ref ?? null } as any,
                  cloudVersion: { paymentStatus: existing?.paymentStatus ?? null } as any,
                  reason: `PAYMENT_UNVERIFIED: a ${device.type} device reported the order as ${payStatus} without a settled gateway payment covering it`
                }
              });
              payStatus = existing?.paymentStatus ?? 'PENDING';
            }
          }

          const data = {
            restaurantId: device.restaurantId,
            deviceId: device.id,
            externalOrderId: evt.externalOrderId,
            status: decision.status,
            ...header,
            items: merge.items as any,
            paymentStatus: payStatus,
            paymentMethod: evt.paymentMethod,
            meta: finalMeta as any
          };
          const source = orderSourceFor(device.type, evt.meta);

          const seq = await nextSyncSequence(tx, device.restaurantId);
          latestSeq = seq;
          const saved = existing
            ? await tx.syncedOrder.update({
                where: { id: existing.id },
                data: { ...data, syncVersion: existing.syncVersion + 1, seq }
              })
            // The order belongs to the branch of the terminal that first pushed it (BUG-048).
            : await tx.syncedOrder.create({ data: { ...data, branchId: device.branchId, source, syncVersion: 1, seq } });

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
          // Actions that take money or an order back are attributed to the terminal that did them and the name it declared. The name is
          // what the terminal says, not proof of who stood there; the device id and type are what the server knows.
          const voided = ['CANCELLED', 'VOID', 'VOIDED', 'REFUNDED'].includes(decision.status) && existing?.status !== decision.status;
          const refunded = payStatus === 'REFUNDED' && existing?.paymentStatus !== 'REFUNDED';
          const corrected = (evt.meta as { statusCorrection?: boolean } | undefined)?.statusCorrection === true && existing?.status !== decision.status;
          if (existing && (voided || refunded || corrected)) {
            await this.audit.log(
              {
                actorType: 'TENANT', actorId: device.id, restaurantId: device.restaurantId,
                action: refunded ? 'ORDER_REFUNDED' : corrected ? 'ORDER_STATUS_CORRECTED' : 'ORDER_VOIDED', category: 'ORDER',
                details: { orderId: evt.externalOrderId, from: existing.status, to: decision.status, totalAmount: evt.totalAmount, deviceType: device.type, declaredBy: (evt.meta as { cashierName?: string; captainName?: string } | undefined)?.cashierName ?? (evt.meta as { captainName?: string } | undefined)?.captainName ?? null }
              },
              tx
            );
          }
          results.push({ externalOrderId: evt.externalOrderId, status: 'ok', syncVersion: saved.syncVersion });
        } catch (err: any) {
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT order_event`;
          // The savepoint rollback also undid the event claim, so the event stays retryable.
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


  /**
   * Creates an order that originates on the server (a guest's QR order) through the SAME path every device order
   * takes: per-order lock, sequence number, sync event log, realtime wake-up. It is therefore delivered by cursor,
   * by realtime and through the Branch Core exactly like a POS order. There is no second order pipeline.
   * Idempotent on (restaurantId, externalOrderId): a repeat returns the original order and creates nothing.
   */
  async ingestServerOrder(input: ServerOrderInput) {
    const startedAt = Date.now();
    const result = await this.prisma.runAsTenant(input.restaurantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'order:' + input.restaurantId + ':' + input.externalOrderId}))`;
      const existing = await tx.syncedOrder.findUnique({
        where: { restaurantId_externalOrderId: { restaurantId: input.restaurantId, externalOrderId: input.externalOrderId } }
      });
      if (existing) return { order: existing, duplicate: true, seq: existing.seq ?? undefined };

      if (input.serializeRestaurantLimit) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'qr-limit:' + input.restaurantId}))`;
      }
      const extraMeta = input.beforeCreate ? await input.beforeCreate(tx) : undefined;

      const seq = await nextSyncSequence(tx, input.restaurantId);
      const order = await tx.syncedOrder.create({
        data: {
          restaurantId: input.restaurantId,
          branchId: input.branchId,
          deviceId: null,
          externalOrderId: input.externalOrderId,
          source: input.source,
          publicOrderId: input.publicOrderId,
          qrCodeId: input.qrCodeId,
          menuVersion: input.menuVersion,
          orderType: input.orderType,
          status: input.status,
          tableId: input.tableId ?? undefined,
          tableLabel: input.tableLabel ?? undefined,
          items: input.items as any,
          subtotal: input.subtotal,
          taxAmount: input.taxAmount,
          discountAmount: input.discountAmount,
          totalAmount: input.totalAmount,
          notes: input.notes ?? undefined,
          paymentStatus: input.paymentStatus,
          paymentMethod: input.paymentMethod,
          meta: { ...input.meta, ...(extraMeta ?? {}) } as any,
          syncVersion: 1,
          seq
        }
      });
      await tx.syncEventLog.create({
        data: {
          restaurantId: input.restaurantId,
          branchId: input.branchId,
          entityType: 'ORDER',
          entityId: input.externalOrderId,
          traceId: input.externalOrderId,
          action: 'CREATE',
          status: 'SUCCESS',
          latencyMs: Date.now() - startedAt,
          payloadSize: JSON.stringify(input.items).length
        }
      });
      return { order, duplicate: false, seq };
    });

    // After commit, so a woken device's pull always sees the order.
    if (!result.duplicate) {
      this.realtime.publish({ restaurantId: input.restaurantId, branchId: input.branchId, kind: 'orders', seq: result.seq });
    }
    return { order: result.order, duplicate: result.duplicate };
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
