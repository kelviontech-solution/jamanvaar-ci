import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Device, Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApplicationEntitlementsService } from '../application-entitlements/application-entitlements.service';
import { OrderSyncService } from '../order-sync/order-sync.service';
import { QrOperationsService } from './qr-operations.service';
import { qrReportRange } from './qr-report-range';
export const acceptanceSchema = z
  .object({
    version: z.number().int().min(0),
    orderId: z.string().min(1).max(128),
    mobileCheckout: z.boolean(),
    appReturn: z.boolean(),
    kitchenReceived: z.boolean(),
    notes: z.string().trim().max(1000)
  })
  .strict();
@Injectable()
export class QrWorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: ApplicationEntitlementsService,
    private readonly orders: OrderSyncService,
    private readonly ops: QrOperationsService,
    private readonly audit: AuditService
  ) {}
  private async authorize(tx: Prisma.TransactionClient, d: Device) {
    const actor = (d as Device & { adminActorId?: string }).adminActorId;
    if (d.type !== 'POS_ADMIN' || !actor) throw new ForbiddenException('Current owner or manager sign-in required');
    const user = await tx.user.findFirst({ where: { id: actor, restaurantId: d.restaurantId, status: 'ACTIVE' } });
    if (!user || !['OWNER', 'MANAGER'].includes(user.role) || (user.role === 'MANAGER' && (!d.branchId || user.branchId !== d.branchId)))
      throw new ForbiddenException('This workspace is outside your access');
    const entitlement = await this.entitlements.resolve(tx, d.restaurantId, 'QR_ORDERING');
    if (!entitlement.enabled) throw new ForbiddenException('QR Ordering is not included');
    return user;
  }
  async acceptance(d: Device) {
    const health = await this.ops.health(d);
    return this.prisma.runAsTenant(d.restaurantId, async (tx) => {
      await this.authorize(tx, d);
      const record = await tx.syncedEntity.findUnique({
        where: {
          restaurantId_entityType_externalId: { restaurantId: d.restaurantId, entityType: 'QR_PAYMENT_ACCEPTANCE', externalId: d.branchId || 'restaurant' }
        }
      });
      const recent = await tx.syncedOrder.findMany({
        where: {
          restaurantId: d.restaurantId,
          source: 'QR',
          ...(d.branchId ? { branchId: d.branchId } : {}),
          paymentMethod: 'ONLINE',
          paymentStatus: 'SUCCESS',
          paymentEntries: { some: { kind: 'COLLECTION', method: { not: 'CASH' } } }
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { externalOrderId: true, createdAt: true, totalAmount: true, branchId: true, meta: true }
      });
      return {
        health,
        record: record?.payload || null,
        version: record?.syncVersion || 0,
        verifiedOrders: recent.map((o) => ({
          id: o.externalOrderId,
          token: (o.meta as any)?.tokenNumber,
          at: o.createdAt,
          totalPaise: o.totalAmount,
          branchId: o.branchId
        }))
      };
    });
  }
  async saveAcceptance(d: Device, b: z.infer<typeof acceptanceSchema>) {
    if (!d.branchId) throw new BadRequestException('Select one branch to record payment acceptance');
    await this.prisma.runAsTenant(d.restaurantId, async (tx) => {
      const user = await this.authorize(tx, d);
      const order = await tx.syncedOrder.findFirst({
        where: {
          restaurantId: d.restaurantId,
          branchId: d.branchId,
          source: 'QR',
          externalOrderId: b.orderId,
          paymentMethod: 'ONLINE',
          paymentStatus: 'SUCCESS',
          paymentEntries: { some: { kind: 'COLLECTION', method: { not: 'CASH' } } }
        }
      });
      if (!order) throw new BadRequestException('Select an online QR order with a server-confirmed collection in this branch');
      if (!b.mobileCheckout || !b.appReturn || !b.kitchenReceived) throw new BadRequestException('Complete phone, return and kitchen checks first');
      const key = { restaurantId_entityType_externalId: { restaurantId: d.restaurantId, entityType: 'QR_PAYMENT_ACCEPTANCE', externalId: d.branchId! } };
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'qr-acceptance:' + d.restaurantId + ':' + d.branchId}))`;
      const prior = await tx.syncedEntity.findUnique({ where: key });
      if ((prior?.syncVersion || 0) !== b.version) throw new ConflictException('Acceptance changed; refresh before saving');
      const payload = { ...b, at: new Date().toISOString(), actorId: user.id, branchId: d.branchId, totalPaise: order.totalAmount };
      await tx.syncedEntity.upsert({
        where: key,
        create: { restaurantId: d.restaurantId, entityType: 'QR_PAYMENT_ACCEPTANCE', externalId: d.branchId!, payload },
        update: { payload, syncVersion: { increment: 1 } }
      });
      await this.audit.log(
        {
          actorType: 'TENANT',
          actorId: user.id,
          restaurantId: d.restaurantId,
          action: 'QR_PAYMENT_ACCEPTANCE_RECORDED',
          category: 'PAYMENTS',
          details: payload
        },
        tx
      );
    });
    return this.acceptance(d);
  }
  async timeline(d: Device, id: string) {
    const row = await this.prisma.runAsTenant(d.restaurantId, async (tx) => {
      await this.authorize(tx, d);
      return tx.syncedOrder.findFirst({
        where: { restaurantId: d.restaurantId, externalOrderId: id, source: 'QR', ...(d.branchId ? { branchId: d.branchId } : {}) }
      });
    });
    if (!row) throw new NotFoundException('QR order not found');
    const ledger = await this.orders.orderPaymentLedger(d, id);
    const events = [
      { at: row.createdAt.toISOString(), type: 'Order created', detail: (row.meta as any)?.tokenNumber || id },
      ...((row.meta as any)?.qrStatusHistory || []).map((h: any) => ({
        at: h.at,
        type: 'Order status',
        detail: h.status || h.action,
        actor: h.actorId || h.deviceId
      })),
      ...ledger.attempts.map((a) => ({ at: a.createdAt.toISOString(), type: 'Payment attempt', detail: a.status, amountPaise: a.amount })),
      ...ledger.entries.map((e) => ({
        at: e.createdAt.toISOString(),
        type: e.kind === 'REFUND' ? 'Confirmed refund' : 'Confirmed collection',
        detail: e.method,
        amountPaise: e.amount,
        actor: e.actorId
      }))
    ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    return { orderId: id, branchId: row.branchId, status: row.status, paymentStatus: row.paymentStatus, ledger, events };
  }
  async reconciliation(d: Device, from?: string, to?: string, cursor?: string) {
    return this.prisma.runAsTenant(d.restaurantId, async (tx) => {
      await this.authorize(tx, d);
      const range = await qrReportRange(tx, d.restaurantId, d.branchId, from, to);
      const scope: Prisma.OrderPaymentEntryWhereInput = {
        restaurantId: d.restaurantId,
        createdAt: { gte: range.start, lt: range.end },
        order: { source: 'QR', ...(d.branchId ? { branchId: d.branchId } : {}) }
      };
      const grouped = await tx.$queryRaw<
        Array<{ kind: string; method: string; actorId: string | null; branchId: string | null; amount: bigint; count: bigint }>
      >(Prisma.sql`
        SELECT e.kind,e.method,e."actorId",o."branchId",SUM(e.amount)::bigint AS amount,COUNT(*)::bigint AS count
        FROM "OrderPaymentEntry" e JOIN "SyncedOrder" o ON o.id=e."orderId" AND o."restaurantId"=e."restaurantId"
        WHERE e."restaurantId"=${d.restaurantId} AND o.source='QR' AND e."createdAt">=${range.start} AND e."createdAt"<${range.end}
        ${d.branchId ? Prisma.sql`AND o."branchId"=${d.branchId}` : Prisma.empty}
        GROUP BY e.kind,e.method,e."actorId",o."branchId"`);
      const totals = grouped.map((g) => ({ ...g, _sum: { amount: Number(g.amount) }, _count: { _all: Number(g.count) } }));
      let after: any;
      if (cursor) {
        try {
          after = JSON.parse(Buffer.from(cursor, 'base64url').toString());
          if (!Number.isFinite(Date.parse(after.at)) || typeof after.id !== 'string') throw Error();
        } catch {
          throw new BadRequestException('Invalid reconciliation cursor');
        }
      }
      const rows = await tx.orderPaymentEntry.findMany({
        where: { ...scope, ...(after ? { OR: [{ createdAt: { lt: new Date(after.at) } }, { createdAt: new Date(after.at), id: { lt: after.id } }] } : {}) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 101,
        include: { order: { select: { externalOrderId: true, tableLabel: true, meta: true } } }
      });
      const actors = [...new Set(totals.map((t) => t.actorId).filter((id): id is string => !!id))];
      const [users, devices, branches, staff] = await Promise.all([
        tx.user.findMany({ where: { restaurantId: d.restaurantId, id: { in: actors } }, select: { id: true, fullName: true } }),
        tx.device.findMany({ where: { restaurantId: d.restaurantId, id: { in: actors } }, select: { id: true, name: true } }),
        tx.branch.findMany({ where: { restaurantId: d.restaurantId }, select: { id: true, name: true } }),
        tx.syncedEntity.findMany({
          where: { restaurantId: d.restaurantId, entityType: 'STAFF_USER', externalId: { in: actors } },
          select: { externalId: true, payload: true }
        })
      ]);
      const actorName = (id: string | null) =>
        users.find((u) => u.id === id)?.fullName ||
        (staff.find((u) => u.externalId === id)?.payload as any)?.fullName ||
        devices.find((u) => u.id === id)?.name ||
        (id ? 'Former staff / device' : 'Gateway');
      const page = rows.slice(0, 100),
        last = page.at(-1);
      const collectedPaise = totals.filter((t) => t.kind === 'COLLECTION').reduce((n, t) => n + (t._sum.amount || 0), 0),
        refundedPaise = totals.filter((t) => t.kind === 'REFUND').reduce((n, t) => n + (t._sum.amount || 0), 0);
      return {
        from: range.start,
        to: range.end,
        timezone: range.timezone,
        collectedPaise,
        refundedPaise,
        netPaise: collectedPaise - refundedPaise,
        groups: totals.map((t) => ({
          kind: t.kind,
          method: t.method,
          actor: actorName(t.actorId),
          branch: branches.find((b) => b.id === t.branchId)?.name || 'Unassigned',
          amountPaise: t._sum.amount || 0,
          count: t._count._all
        })),
        entries: page.map((e) => ({
          id: e.id,
          at: e.createdAt,
          kind: e.kind,
          method: e.method,
          amountPaise: e.amount,
          actor: actorName(e.actorId),
          orderId: e.order.externalOrderId,
          token: (e.order.meta as any)?.tokenNumber,
          table: e.order.tableLabel
        })),
        nextCursor: rows.length > 100 && last ? Buffer.from(JSON.stringify({ at: last.createdAt.toISOString(), id: last.id })).toString('base64url') : null
      };
    });
  }
  async printInventory(d: Device) {
    return this.prisma.runAsTenant(d.restaurantId, async (tx) => {
      await this.authorize(tx, d);
      const codes = await tx.qrCode.findMany({
        where: { restaurantId: d.restaurantId, ...(d.branchId ? { branchId: d.branchId } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 1001
      });
      if (codes.length > 1000) throw new BadRequestException('Choose one branch or archive old codes before exporting this inventory');
      const branches = await tx.branch.findMany({ where: { restaurantId: d.restaurantId }, select: { id: true, name: true } });
      return {
        codes: codes.map((c) => ({
          id: c.id,
          branch: branches.find((b) => b.id === c.branchId)?.name || 'Restaurant',
          table: c.tableNumber ? 'Table ' + c.tableNumber : 'Menu QR',
          version: c.version,
          status: c.status,
          createdAt: c.createdAt,
          revokedAt: c.revokedAt
        }))
      };
    });
  }
  async pickupCalendar(d: Device, from?: string, to?: string) {
    if (!d.branchId) throw new BadRequestException('Select one branch for the pickup calendar');
    return this.prisma.runAsTenant(d.restaurantId, async (tx) => {
      await this.authorize(tx, d);
      await this.entitlements.assertQrCapability(tx, d.restaurantId, 'QR_SCHEDULED_PICKUP', d.branchId);
      const range = await qrReportRange(tx, d.restaurantId, d.branchId, from, to),
        settings = await this.ops.effectiveIn(tx, d.restaurantId, d.branchId);
      const rows = await tx.syncedOrder.findMany({
        where: {
          restaurantId: d.restaurantId,
          branchId: d.branchId,
          source: 'QR',
          AND: [{ meta: { path: ['pickupAt'], gte: range.start.toISOString() } }, { meta: { path: ['pickupAt'], lt: range.end.toISOString() } }]
        },
        orderBy: { createdAt: 'asc' },
        take: 2001
      });
      if (rows.length > 2000) throw new BadRequestException('Choose a shorter date range');
      return {
        timezone: range.timezone,
        enabled: settings.pickupEnabled,
        capacity: settings.slotCapacity,
        orders: rows.map((o) => ({
          id: o.externalOrderId,
          version: o.syncVersion,
          token: (o.meta as any)?.tokenNumber,
          pickupAt: (o.meta as any).pickupAt,
          status: o.status,
          paymentStatus: o.paymentStatus,
          customer: (o.meta as any)?.customerName || 'Guest',
          items: o.items,
          handover: (o.meta as any)?.pickupHandover || null
        }))
      };
    });
  }
}
