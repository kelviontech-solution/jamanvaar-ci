import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Device } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { nextSyncSequence } from '../../common/sync-sequence';
import { RealtimeBus } from '../../common/realtime/realtime-bus';

const PAGE = 500;

export const movementSchema = z.object({
  movementId: z.string().min(1).max(128),
  itemId: z.string().min(1).max(128),
  /** Only honoured from a restaurant-wide device (no branch of its own); a branch-bound device always writes to its own branch. */
  branchId: z.string().uuid().optional(),
  itemName: z.string().min(1).max(200),
  type: z.string().min(1).max(32),
  quantityDelta: z.number().finite().refine((n) => Math.abs(n) <= 1_000_000, 'quantityDelta out of range'),
  unit: z.string().min(1).max(32),
  orderId: z.string().max(128).optional(),
  reason: z.string().max(500).default(''),
  occurredAt: z.string().datetime({ offset: true })
});
export const pushMovementsSchema = z.object({ movements: z.array(z.unknown()).min(1).max(200) });

export interface MovementPushResult {
  movementId: string;
  status: 'ok' | 'error';
  duplicate?: boolean;
  seq?: number;
  error?: string;
}

@Injectable()
export class InventoryLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeBus
  ) {}

  /** Appends each movement once. A retried movementId is acknowledged as a duplicate and never counted twice. */
  async push(device: Device, rawMovements: unknown[]): Promise<{ results: MovementPushResult[] }> {
    const results: MovementPushResult[] = [];
    await this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      for (const raw of rawMovements) {
        const parsed = movementSchema.safeParse(raw);
        if (!parsed.success) {
          const id = raw && typeof raw === 'object' && typeof (raw as { movementId?: unknown }).movementId === 'string' ? (raw as { movementId: string }).movementId : 'unknown';
          results.push({ movementId: id, status: 'error', error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ').slice(0, 300) });
          continue;
        }
        const m = parsed.data;
        if (device.branchId && m.branchId && m.branchId !== device.branchId) {
          results.push({ movementId: m.movementId, status: 'error', error: 'BRANCH_FORBIDDEN: Inventory belongs to another branch' });
          continue;
        }
        let branchId: string | null = device.branchId;
        if (!device.branchId && m.branchId) {
          const branch = await tx.branch.findFirst({ where: { id: m.branchId, restaurantId: device.restaurantId }, select: { id: true } });
          if (!branch) {
            results.push({ movementId: m.movementId, status: 'error', error: 'branchId is not a branch of this restaurant' });
            continue;
          }
          branchId = branch.id;
        }
        const prior = await tx.inventoryMovement.findFirst({ where: { restaurantId: device.restaurantId, movementId: m.movementId } });
        const item = await tx.syncedEntity.findFirst({ where: { restaurantId: device.restaurantId, entityType: 'INVENTORY_ITEM', externalId: m.itemId }, select: { payload: true } });
        const itemBranch = (item?.payload as { branchId?: string } | null)?.branchId;
        const order = m.orderId ? await tx.syncedOrder.findFirst({ where: { restaurantId: device.restaurantId, externalOrderId: m.orderId }, select: { branchId: true } }) : null;
        if ((prior && prior.branchId !== branchId) || (itemBranch && itemBranch !== branchId) || (order?.branchId && order.branchId !== branchId)) {
          results.push({ movementId: m.movementId, status: 'error', error: 'BRANCH_FORBIDDEN: Movement, item and order must belong to this branch' });
          continue;
        }
        const seq = await nextSyncSequence(tx, device.restaurantId);
        const inserted = await tx.$executeRaw`
          INSERT INTO "InventoryMovement"
            ("id","restaurantId","branchId","movementId","deviceId","itemId","itemName","type","quantityDelta","unit","orderId","reason","occurredAt","seq")
          VALUES
            (${randomUUID()}, ${device.restaurantId}, ${branchId}, ${m.movementId}, ${device.id}, ${m.itemId}, ${m.itemName}, ${m.type},
             ${m.quantityDelta}, ${m.unit}, ${m.orderId ?? null}, ${m.reason}, ${new Date(m.occurredAt)}, ${seq})
          ON CONFLICT ("restaurantId","movementId") DO NOTHING`;
        results.push(inserted === 0 ? { movementId: m.movementId, status: 'ok', duplicate: true } : { movementId: m.movementId, status: 'ok', seq });
      }
    });
    if (results.some((r) => r.status === 'ok' && !r.duplicate)) {
      this.realtime.publish({ restaurantId: device.restaurantId, branchId: device.branchId, kind: 'inventory', originDeviceId: device.id });
    }
    return { results };
  }

  /** Movements after the cursor, oldest first: this device's branch only, or every branch for a restaurant-wide device. */
  async pull(device: Device, afterSeq: number) {
    const rows = await this.prisma.runAsTenant(device.restaurantId, (tx) =>
      tx.inventoryMovement.findMany({
        where: { restaurantId: device.restaurantId, ...(device.branchId ? { branchId: device.branchId } : {}), seq: { gt: afterSeq } },
        orderBy: { seq: 'asc' },
        take: PAGE + 1
      })
    );
    const hasMore = rows.length > PAGE;
    const movements = hasMore ? rows.slice(0, PAGE) : rows;
    const latestSeq = movements.length > 0 ? movements[movements.length - 1].seq : afterSeq;
    return { movements, latestSeq, hasMore };
  }

  /** Net change per branch and item (this device's branch only, or all branches for a restaurant-wide device): the sum of every movement, from every device. */
  async balances(device: Device) {
    const grouped = await this.prisma.runAsTenant(device.restaurantId, (tx) =>
      tx.inventoryMovement.groupBy({
        by: ['branchId', 'itemId', 'itemName', 'unit'],
        where: { restaurantId: device.restaurantId, ...(device.branchId ? { branchId: device.branchId } : {}) },
        _sum: { quantityDelta: true },
        _count: { _all: true }
      })
    );
    return grouped.map((g) => ({
      branchId: g.branchId,
      itemId: g.itemId,
      itemName: g.itemName,
      unit: g.unit,
      netQuantity: Math.round((g._sum.quantityDelta ?? 0) * 1000) / 1000,
      movementCount: g._count._all
    }));
  }
}
