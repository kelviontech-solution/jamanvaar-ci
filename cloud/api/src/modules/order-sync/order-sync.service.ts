import { Injectable } from '@nestjs/common';
import { Device } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderSyncEventDto } from './dto/push-order-sync.dto';

const CATCH_UP_DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000; // 24h
const CATCH_UP_MAX_ROWS = 500;

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
  async pushEvents(device: Device, events: OrderSyncEventDto[]): Promise<{ results: OrderSyncPushResult[]; serverTime: string }> {
    const results: OrderSyncPushResult[] = [];

    await this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      for (const evt of events) {
        const startedAt = Date.now();
        try {
          const existing = await tx.syncedOrder.findUnique({
            where: { restaurantId_externalOrderId: { restaurantId: device.restaurantId, externalOrderId: evt.externalOrderId } }
          });

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
            notes: evt.notes
          };

          const saved = existing
            ? await tx.syncedOrder.update({
                where: { id: existing.id },
                data: { ...data, syncVersion: existing.syncVersion + 1 }
              })
            : await tx.syncedOrder.create({ data: { ...data, syncVersion: 1 } });

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

    const orders = await this.prisma.runAsTenant(device.restaurantId, (tx) =>
      tx.syncedOrder.findMany({
        where: { updatedAt: { gt: sinceDate } },
        orderBy: { updatedAt: 'asc' },
        take: CATCH_UP_MAX_ROWS
      })
    );

    return { orders, serverTime: new Date().toISOString() };
  }
}
