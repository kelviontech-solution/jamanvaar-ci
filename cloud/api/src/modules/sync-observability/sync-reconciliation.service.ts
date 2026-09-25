import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DEGRADED_WITHIN_MS } from '../../common/device-health';

export type IssueSeverity = 'high' | 'medium' | 'low';

export interface SyncIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
  entityType: string;
  entityId?: string;
  deviceId?: string;
  detail?: string;
}

type TxClient = Prisma.TransactionClient;

const ROW_LIMIT = 200;

/**
 * Looks for inconsistencies in one restaurant's synced data and reports them. It never changes
 * anything: financial and stock discrepancies are for a person to review, not to be quietly repaired.
 */
@Injectable()
export class SyncReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  runAsPlatform(restaurantId: string): Promise<{ restaurantId: string; issues: SyncIssue[]; checkedAt: string }> {
    return this.prisma.runAsPlatform((tx) => this.run(tx, restaurantId));
  }

  runAsTenant(restaurantId: string, branchId: string | null): Promise<{ restaurantId: string; issues: SyncIssue[]; checkedAt: string }> {
    return this.prisma.runAsTenant(restaurantId, (tx) => this.run(tx, restaurantId, branchId));
  }

  private async run(tx: TxClient, restaurantId: string, branchId: string | null = null) {
    const branchFilter = branchId ? { branchId } : {};
    const issues: SyncIssue[] = [];

    // 1. Paid orders with no payment transaction to back the payment.
    const paid = await tx.syncedOrder.findMany({
      where: { restaurantId, paymentStatus: 'SUCCESS', ...branchFilter },
      select: { externalOrderId: true, meta: true },
      take: 1000
    });
    for (const o of paid) {
      const txn = (o.meta as { paymentTransactionId?: string } | null)?.paymentTransactionId;
      if (!txn) {
        issues.push({
          code: 'PAID_WITHOUT_TRANSACTION', severity: 'high', entityType: 'ORDER', entityId: o.externalOrderId,
          message: 'Order is marked paid but has no payment transaction reference.'
        });
      }
    }

    // 2. The same human order number on two different orders (a numbering collision).
    const dupes = await tx.$queryRaw<{ n: string; c: bigint }[]>`
      SELECT meta->>'orderNumber' AS n, COUNT(*) AS c
      FROM "SyncedOrder"
      WHERE "restaurantId" = ${restaurantId}
        AND meta->>'orderNumber' IS NOT NULL
        ${branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty}
      GROUP BY 1
      HAVING COUNT(*) > 1
      LIMIT ${ROW_LIMIT}`;
    for (const d of dupes) {
      issues.push({
        code: 'DUPLICATE_ORDER_NUMBER', severity: 'high', entityType: 'ORDER', entityId: d.n,
        message: 'Two different orders share one order number.', detail: `${d.n} appears on ${Number(d.c)} orders`
      });
    }

    // 3. Stock that has gone below zero: an oversell to review.
    const stock = await tx.inventoryMovement.groupBy({
      by: ['branchId', 'itemId', 'itemName'],
      where: { restaurantId, ...branchFilter },
      _sum: { quantityDelta: true }
    });
    for (const s of stock) {
      if ((s._sum.quantityDelta ?? 0) < -0.0005) {
        issues.push({
          code: 'NEGATIVE_STOCK', severity: 'medium', entityType: 'INVENTORY', entityId: s.itemId,
          message: `${s.itemName} has gone below zero (oversold).`, detail: `net ${Math.round((s._sum.quantityDelta ?? 0) * 1000) / 1000}`
        });
      }
    }

    // 4. Conflicts nobody has resolved yet.
    const conflicts = await tx.syncConflict.findMany({
      where: { restaurantId, resolution: 'PENDING', ...branchFilter },
      select: { id: true, entityType: true, entityId: true, reason: true },
      take: ROW_LIMIT
    });
    for (const c of conflicts) {
      issues.push({
        code: 'UNRESOLVED_CONFLICT', severity: 'medium', entityType: c.entityType, entityId: c.entityId, message: c.reason
      });
    }

    // 5 + 6. Devices reporting a problem, or silent with changes still waiting on them.
    const devices = await tx.device.findMany({
      where: { restaurantId, status: 'ACTIVE', ...branchFilter },
      select: { id: true, type: true, name: true, lastSeenAt: true, pendingSyncCount: true, syncError: true }
    });
    const now = Date.now();
    for (const d of devices) {
      const label = d.name ?? d.type;
      if (d.syncError) {
        issues.push({ code: 'DEVICE_SYNC_ERROR', severity: 'high', entityType: 'DEVICE', entityId: d.id, deviceId: d.id, message: `${label}: ${d.syncError}` });
      }
      const silent = !d.lastSeenAt || now - d.lastSeenAt.getTime() > DEGRADED_WITHIN_MS;
      if (silent && (d.pendingSyncCount ?? 0) > 0) {
        issues.push({
          code: 'DEVICE_OFFLINE_WITH_BACKLOG', severity: 'medium', entityType: 'DEVICE', entityId: d.id, deviceId: d.id,
          message: `${label} is offline with ${d.pendingSyncCount} change(s) not yet synced.`
        });
      }
    }

    // 7. Commands that were sent to a device and never succeeded (last 24h).
    const failedCommands = await tx.deviceCommand.findMany({
      where: { restaurantId, status: 'FAILED', issuedAt: { gt: new Date(now - 24 * 3600_000) } },
      select: { id: true, deviceId: true, commandType: true, errorMessage: true },
      take: 50
    });
    for (const c of failedCommands) {
      issues.push({
        code: 'COMMAND_FAILED', severity: 'low', entityType: 'DEVICE_COMMAND', entityId: c.id, deviceId: c.deviceId,
        message: `${c.commandType} failed: ${c.errorMessage ?? 'no reason given'}`
      });
    }

    const rank: Record<IssueSeverity, number> = { high: 0, medium: 1, low: 2 };
    issues.sort((a, b) => rank[a.severity] - rank[b.severity]);
    return { restaurantId, issues, checkedAt: new Date().toISOString() };
  }

  /** Everything the server recorded about one traced journey, oldest first, plus the order it produced. */
  async trace(traceId: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const events = await tx.syncEventLog.findMany({ where: { traceId }, orderBy: { timestamp: 'asc' } });
      const restaurantId = events[0]?.restaurantId;
      const orderId = traceId;
      const order = restaurantId
        ? await tx.syncedOrder.findFirst({
            where: { restaurantId, OR: [{ externalOrderId: orderId }, { externalOrderId: (events[0] as { entityId?: string }).entityId ?? '' }] }
          })
        : null;
      const conflicts = restaurantId
        ? await tx.syncConflict.findMany({ where: { restaurantId, entityId: { in: events.map((e) => e.entityId).filter((v): v is string => !!v) } }, orderBy: { createdAt: 'asc' } })
        : [];
      return {
        traceId,
        events: events.map((e) => ({
          eventId: e.eventId, entityType: e.entityType, entityId: e.entityId, action: e.action, status: e.status,
          errorMessage: e.errorMessage, deviceId: e.deviceId, restaurantId: e.restaurantId, timestamp: e.timestamp
        })),
        order,
        conflicts
      };
    });
  }
}
