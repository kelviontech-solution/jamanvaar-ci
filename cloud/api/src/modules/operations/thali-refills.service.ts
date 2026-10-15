import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Device, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { OperationsService, OpsScope } from './operations.service';
import { StaffSessionService } from '../entity-sync/staff-session.service';
import { nextSyncSequence } from '../../common/sync-sequence';
import { RealtimeBus } from '../../common/realtime/realtime-bus';
import { snapshotOrderLines } from '../order-sync/order-snapshots';
export interface RefillPolicy {
  mealItemId: string;
  includedItemIds: string[];
  maxRefillsPerOrder: number;
}
@Injectable()
export class ThaliRefillsService {
  constructor(
    private readonly ops: OperationsService,
    private readonly staff: StaffSessionService,
    private readonly bus: RealtimeBus
  ) {}
  async policy(s: OpsScope) {
    return this.ops.read(s, 'OPS_REFILL_POLICY');
  }
  async save(s: OpsScope, input: RefillPolicy & { expectedVersion: number }) {
    this.ops.require(s, 'POS_ADMIN');
    const ids = [input.mealItemId, ...input.includedItemIds];
    const rows = await this.ops.prisma.runAsTenant(s.restaurantId, (tx) =>
      tx.syncedEntity.findMany({
        where: { restaurantId: s.restaurantId, entityType: 'MENU_ITEM', externalId: { in: [...new Set(ids)] } },
        select: { payload: true }
      })
    );
    if (rows.filter((r) => !(r.payload as any)?.deleted).length !== new Set(ids).size) throw new BadRequestException('Choose existing meal and refill dishes');
    const { expectedVersion, ...data } = input;
    return this.ops.write(s, 'OPS_REFILL_POLICY', s.branchId, data, expectedVersion, 'REFILL_POLICY_UPDATED');
  }
  async forDevice(d: Device) {
    if (d.type !== 'CAPTAIN' || !d.branchId) throw new ForbiddenException('Use a branch Captain device');
    return this.ops.prisma.runAsTenant(
      d.restaurantId,
      async (tx) =>
        (
          await tx.syncedEntity.findUnique({
            where: { restaurantId_entityType_externalId: { restaurantId: d.restaurantId, entityType: 'OPS_REFILL_POLICY', externalId: d.branchId! } }
          })
        )?.payload ?? null
    );
  }
  async request(d: Device, input: { orderId: string; itemId: string; quantity: number; idempotencyKey: string; staffToken: string }) {
    if (d.type !== 'CAPTAIN' || !d.branchId) throw new ForbiddenException('Use a branch Captain device');
    const proof = this.staff.verify(input.staffToken, d.restaurantId, d.id, 'session');
    if (!proof) throw new ForbiddenException('Sign in again to request refills');
    const result = await this.ops.prisma.runAsTenant(d.restaurantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'order:' + d.restaurantId + ':' + input.orderId}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'entity:' + d.restaurantId}))`;
      const person = await tx.syncedEntity.findUnique({
          where: { restaurantId_entityType_externalId: { restaurantId: d.restaurantId, entityType: 'STAFF_USER', externalId: proof.sid } }
        }),
        p = person?.payload as any;
      if (
        !p ||
        p.isActive === false ||
        p.deleted ||
        (p.branchId && p.branchId !== d.branchId) ||
        !['role-captain', 'role-waiter', 'role-manager', 'role-owner'].includes(p.roleId ?? proof.role)
      )
        throw new ForbiddenException('Current branch service-staff access is required');
      const order = await tx.syncedOrder.findFirst({ where: { restaurantId: d.restaurantId, branchId: d.branchId, externalOrderId: input.orderId } });
      if (!order) throw new NotFoundException('Order not found');
      const meta = (order.meta as any) ?? {},
        requests = meta.refillRequests ?? [];
      const previous = requests.find((r: any) => r.key === input.idempotencyKey);
      if (previous) {
        if (previous.itemId !== input.itemId || previous.quantity !== input.quantity)
          throw new ConflictException('This refill reference was already used for different dishes or quantities');
        return { reference: input.orderId, duplicate: true };
      }
      if (order.orderType !== 'DINE_IN' || ['CANCELLED', 'VOID', 'VOIDED', 'REFUNDED', 'COMPLETED'].includes(order.status))
        throw new ConflictException('Refills require an active dine-in order');
      const policy = (
          await tx.syncedEntity.findUnique({
            where: { restaurantId_entityType_externalId: { restaurantId: d.restaurantId, entityType: 'OPS_REFILL_POLICY', externalId: d.branchId! } }
          })
        )?.payload as any,
        items = Array.isArray(order.items) ? (order.items as any[]) : [];
      if (
        !policy ||
        !policy.includedItemIds.includes(input.itemId) ||
        !items.some((l) => l.menuItemId === policy.mealItemId && l.kitchenStatus !== 'CANCELLED')
      )
        throw new BadRequestException('This refill is not included with the ordered meal. Add it as a normal chargeable dish.');
      if (requests.reduce((n: number, r: any) => n + r.quantity, 0) + input.quantity > policy.maxRefillsPerOrder)
        throw new ConflictException('The configured refill limit is reached; ask a manager');
      const item = await tx.syncedEntity.findUnique({
          where: { restaurantId_entityType_externalId: { restaurantId: d.restaurantId, entityType: 'MENU_ITEM', externalId: input.itemId } }
        }),
        dish = item?.payload as any;
      if (!dish || dish.deleted || dish.isAvailable === false || (dish.branchIds?.length && !dish.branchIds.includes(d.branchId)))
        throw new BadRequestException('This dish is not available in this branch');
      const override = await tx.syncedEntity.findUnique({
        where: {
          restaurantId_entityType_externalId: { restaurantId: d.restaurantId, entityType: 'BRANCH_MENU_OVERRIDE', externalId: `${d.branchId}:${input.itemId}` }
        }
      });
      if ((override?.payload as any)?.isAvailable === false) throw new BadRequestException('This refill dish is unavailable');
      const at = new Date().toISOString(),
        line = {
          externalItemId: randomUUID(),
          menuItemId: input.itemId,
          name: `Refill: ${dish.name}`,
          quantity: input.quantity,
          unitPrice: 0,
          lineTotal: 0,
          modifiers: [],
          kitchenStation: dish.kitchenStation ?? 'Main Kitchen',
          kitchenStatus: 'PENDING',
          specialInstructions: `INCLUDED REFILL · ${order.tableLabel ?? 'Table'} · Requested by ${proof.name}`
        };
      const snapshot = (await snapshotOrderLines(tx, d.restaurantId, [line]))[0],
        seq = await nextSyncSequence(tx, d.restaurantId);
      await tx.syncedOrder.update({
        where: { id: order.id },
        data: {
          items: [...items, snapshot] as Prisma.InputJsonValue,
          status: 'PREPARING',
          meta: {
            ...meta,
            refillRequests: [
              ...requests,
              { key: input.idempotencyKey, itemId: input.itemId, quantity: input.quantity, at, staffId: proof.sid, included: true }
            ],
            operationHistory: [...(meta.operationHistory ?? []), { at, status: 'PREPARING', actor: proof.name, action: 'REFILL_REQUESTED' }].slice(-150)
          },
          syncVersion: { increment: 1 },
          seq
        }
      });
      await tx.syncEventLog.create({
        data: {
          restaurantId: d.restaurantId,
          branchId: d.branchId,
          deviceId: d.id,
          entityType: 'ORDER',
          entityId: input.orderId,
          action: 'UPDATE',
          status: 'SUCCESS'
        }
      });
      return { reference: input.orderId, duplicate: false, seq };
    });
    if (!result.duplicate) this.bus.publish({ restaurantId: d.restaurantId, branchId: d.branchId, kind: 'orders', seq: result.seq });
    return result;
  }
}
