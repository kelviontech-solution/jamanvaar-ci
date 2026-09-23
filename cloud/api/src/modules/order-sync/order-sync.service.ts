import { Injectable } from '@nestjs/common';
import { Device } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
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
  error?: string;
}

@Injectable()
export class OrderSyncService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upserts each event by (restaurantId, externalOrderId) — the local app's
   * own order id is the idempotency key, so a retried push after a dropped
   * response (the exact failure mode BUG-009 traced to) never double-creates
   * a row, it just re-applies the same state.
   */
  async pushEvents(device: Device, rawEvents: unknown[]): Promise<{ results: OrderSyncPushResult[]; serverTime: string }> {
    const results: OrderSyncPushResult[] = [];

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
        try {
          const existing = await tx.syncedOrder.findUnique({
            where: { restaurantId_externalOrderId: { restaurantId: device.restaurantId, externalOrderId: evt.externalOrderId } }
          });

          // security-audit HIGH-05: a settled/refunded order's payment status must not
          // regress from a device with no payment authority (KDS, Captain, Kiosk) or
          // from a device other than the one that actually recorded the settlement —
          // this is exactly the "stale KDS push reopens a paid order" scenario the
          // audit demonstrated. The push is recorded as a conflict, not silently applied.
          if (
            existing &&
            existing.paymentStatus &&
            TERMINAL_PAID_STATUSES.has(existing.paymentStatus) &&
            evt.paymentStatus !== undefined &&
            evt.paymentStatus !== existing.paymentStatus &&
            existing.deviceId !== device.id &&
            !PAYMENT_AUTHORITATIVE_DEVICE_TYPES.has(device.type)
          ) {
            await tx.syncConflict.create({
              data: {
                restaurantId: device.restaurantId,
                branchId: device.branchId,
                deviceId: device.id,
                entityType: 'ORDER',
                entityId: evt.externalOrderId,
                localVersion: evt as any,
                cloudVersion: { paymentStatus: existing.paymentStatus, totalAmount: existing.totalAmount, status: existing.status } as any,
                reason: `${device.type} device attempted to change paymentStatus from ${existing.paymentStatus} to ${evt.paymentStatus} on a settled order`
              }
            });
            results.push({ externalOrderId: evt.externalOrderId, status: 'error', error: 'Order payment status is final; this device cannot change it' });
            continue;
          }

          const data = {
            restaurantId: device.restaurantId,
            deviceId: device.id,
            externalOrderId: evt.externalOrderId,
            orderType: evt.orderType,
            status: evt.status,
            tableId: evt.tableId,
            tableLabel: evt.tableLabel,
            items: evt.items as any,
            subtotal: evt.subtotal,
            taxAmount: evt.taxAmount,
            discountAmount: evt.discountAmount,
            totalAmount: evt.totalAmount,
            notes: evt.notes,
            paymentStatus: evt.paymentStatus,
            paymentMethod: evt.paymentMethod,
            meta: (evt.meta ?? undefined) as any
          };

          const saved = existing
            ? await tx.syncedOrder.update({
                where: { id: existing.id },
                data: { ...data, syncVersion: existing.syncVersion + 1 }
              })
            // The order belongs to the branch of the terminal that first pushed it (BUG-048).
            : await tx.syncedOrder.create({ data: { ...data, branchId: device.branchId, syncVersion: 1 } });

          await tx.syncEventLog.create({
            data: {
              restaurantId: device.restaurantId,
              deviceId: device.id,
              entityType: 'ORDER',
              action: existing ? 'UPDATE' : 'CREATE',
              status: 'SUCCESS',
              latencyMs: Date.now() - startedAt,
              payloadSize: JSON.stringify(evt).length
            }
          });

          results.push({ externalOrderId: evt.externalOrderId, status: 'ok', syncVersion: saved.syncVersion });
        } catch (err: any) {
          await tx.syncEventLog.create({
            data: {
              restaurantId: device.restaurantId,
              deviceId: device.id,
              entityType: 'ORDER',
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

    return { results, serverTime: new Date().toISOString() };
  }

  /**
   * Catch-up/replay pull for a (re)connecting device — not just a live push
   * target. `since` is the cursor the device persisted from a prior call's
   * `serverTime`, so a device that was offline for hours gets everything it
   * missed in one shot rather than only future pushes.
   */
  async catchUp(device: Device, since?: string) {
    const sinceDate = since ? new Date(since) : new Date(Date.now() - CATCH_UP_DEFAULT_LOOKBACK_MS);

    // security-audit HIGH-05: this used to have no branchId filter at all, so a device
    // bound to one branch of a multi-branch restaurant received every OTHER branch's
    // orders too, including customer name/phone in `meta`. A device with no branch
    // assigned (branchId null) still sees every order — that matches how an
    // unassigned/whole-restaurant terminal is expected to behave — but a branch-bound
    // device now only sees its own branch's orders plus any not yet tied to a branch.
    const orders = await this.prisma.runAsTenant(device.restaurantId, (tx) =>
      tx.syncedOrder.findMany({
        where: {
          updatedAt: { gt: sinceDate },
          ...(device.branchId ? { OR: [{ branchId: device.branchId }, { branchId: null }] } : {})
        },
        orderBy: { updatedAt: 'asc' },
        take: CATCH_UP_MAX_ROWS
      })
    );

    return { orders, serverTime: new Date().toISOString() };
  }
}
