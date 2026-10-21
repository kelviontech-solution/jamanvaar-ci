import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { Device } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplicationEntitlementsService } from '../application-entitlements/application-entitlements.service';
import { paymentBalance, COLLECTED_ORDER_STATUSES } from '../payments/order-payment-ledger';
import { QrOperationsService } from './qr-operations.service';
import { QrSettingsService } from './qr-settings.service';

export interface QrAttentionItem {
  id: string;
  kind: 'SERVICE' | 'NEW_ORDER' | 'DELAYED_ORDER' | 'PAYMENT_DUE' | 'PAYMENT_PENDING';
  priority: 'URGENT' | 'ACTION';
  title: string;
  detail: string;
  at: string;
  branchId: string | null;
  branchName?: string;
  requestId?: string;
  version?: number;
  status?: string;
  quietNow?: boolean;
  orderId?: string;
  orderNumber?: string;
}

@Injectable()
export class QrAttentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: ApplicationEntitlementsService,
    private readonly operations: QrOperationsService,
    private readonly settings: QrSettingsService
  ) {}
  async read(device: Device, requestedBranch?: string) {
    if (device.type !== 'POS_ADMIN') throw new ForbiddenException('QR administration required');
    if (device.branchId && requestedBranch && device.branchId !== requestedBranch)
      throw new ForbiddenException('This branch is outside your current admin scope.');
    const branchId = device.branchId || requestedBranch || null,
      scoped = { ...device, branchId };
    const access = await this.prisma.runAsTenant(device.restaurantId, async (tx) => {
      if (branchId && !(await tx.branch.findFirst({ where: { id: branchId, restaurantId: device.restaurantId, status: 'ACTIVE' } })))
        throw new ForbiddenException('Branch is not active in this restaurant.');
      return this.entitlements.resolveQrCapabilities(tx, device.restaurantId, branchId);
    });
    if (!access.module.enabled) throw new ForbiddenException('QR Ordering is not active for this scope.');
    const serviceAvailable = access.capabilities.some((cap) => cap.code === 'QR_SERVICE_REQUESTS' && cap.enabled);
    const [service, data] = await Promise.all([
      serviceAvailable ? this.operations.staffRequests(scoped) : Promise.resolve({ requests: [] }),
      this.prisma.runAsTenant(device.restaurantId, async (tx) => {
        const where = {
          restaurantId: device.restaurantId,
          source: 'QR',
          ...(branchId ? { branchId } : {}),
          OR: [
            { status: { in: ['NEW', 'PREPARING', 'READY', 'DRAFT'] } },
            { status: 'COMPLETED', paymentStatus: { in: ['PENDING', 'PARTIALLY_PAID', 'FAILED'] } }
          ]
        };
        const orders = await tx.syncedOrder.findMany({
          where,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            externalOrderId: true,
            branchId: true,
            createdAt: true,
            status: true,
            paymentStatus: true,
            totalAmount: true,
            tableLabel: true,
            meta: true
          },
          take: 2001
        });
        if (orders.length > 2000)
          throw new BadRequestException('Select a branch to review this large order backlog. Open QR Orders filters for the full history.');
        const entries = await tx.orderPaymentEntry.findMany({
          where: { restaurantId: device.restaurantId, orderId: { in: orders.map((order) => order.id) } },
          select: { orderId: true, kind: true, amount: true }
        });
        const branches = await tx.branch.findMany({ where: { restaurantId: device.restaurantId, status: 'ACTIVE' }, select: { id: true, name: true } });
        return { orders, entries, branches };
      })
    ]);
    const preparation = new Map<string | null, number>();
    for (const id of new Set(data.orders.map((order) => order.branchId)))
      preparation.set(id, (await this.settings.effective(device.restaurantId, id)).rules?.preparationMinutes ?? 20);
    const now = Date.now(),
      items: QrAttentionItem[] = [];
    for (const request of service.requests) {
      if (!['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'].includes(request.status)) continue;
      items.push({
        id: 'service:' + request.id,
        kind: 'SERVICE',
        priority: request.overdue || request.escalatedAt ? 'URGENT' : 'ACTION',
        title: `Table ${request.tableNumber} · ${request.label}`,
        detail:
          request.note ||
          { OPEN: 'Waiting for a response', ACKNOWLEDGED: 'Acknowledged · still needs service', IN_PROGRESS: 'Service in progress' }[
            String(request.status) as 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS'
          ] ||
          request.status,
        at: request.createdAt,
        branchId: request.branchId,
        branchName: request.branchName,
        requestId: request.id,
        version: request.version,
        status: request.status,
        quietNow: request.quietNow
      });
    }
    for (const order of data.orders) {
      const meta = (order.meta ?? {}) as Record<string, unknown>,
        number = String(meta.tokenNumber || order.externalOrderId),
        minutes = Math.max(1, preparation.get(order.branchId) || 20);
      const pickup = typeof meta.pickupAt === 'string' ? Date.parse(meta.pickupAt) : 0;
      const start = Math.max(order.createdAt.getTime(), Number.isFinite(pickup) && pickup > 0 ? pickup - minutes * 60000 : 0),
        age = now - start;
      const allocations = data.entries.filter((entry) => entry.orderId === order.id),
        balance = paymentBalance(
          order.totalAmount,
          allocations.length ? allocations : COLLECTED_ORDER_STATUSES.has(order.paymentStatus || '') ? [{ kind: 'COLLECTION', amount: order.totalAmount }] : []
        );
      const base = {
        id: 'order:' + order.externalOrderId,
        at: order.createdAt.toISOString(),
        branchId: order.branchId,
        branchName: data.branches.find((branch) => branch.id === order.branchId)?.name,
        orderId: order.externalOrderId,
        orderNumber: number
      };
      const label = `${number}${order.tableLabel ? ` · Table ${order.tableLabel}` : ''}`;
      if (['NEW', 'PREPARING'].includes(order.status) && age > minutes * 60000)
        items.push({
          ...base,
          kind: 'DELAYED_ORDER',
          priority: 'URGENT',
          title: label,
          detail: `Kitchen delay · waiting ${Math.floor(age / 60000)} min (target ${minutes} min)`
        });
      else if (order.status === 'NEW') items.push({ ...base, kind: 'NEW_ORDER', priority: 'ACTION', title: label, detail: 'New order · awaiting acceptance' });
      else if (['READY', 'COMPLETED'].includes(order.status) && balance.outstandingPaise > 0)
        items.push({
          ...base,
          kind: 'PAYMENT_DUE',
          priority: 'ACTION',
          title: label,
          detail: `${order.status === 'READY' ? 'Ready to serve' : 'Completed'} · ${(balance.outstandingPaise / 100).toFixed(2)} ${String(meta.currency || 'INR')} still due`
        });
      else if (order.status === 'DRAFT' && (age > 10 * 60000 || order.paymentStatus === 'FAILED'))
        items.push({
          ...base,
          kind: 'PAYMENT_PENDING',
          priority: 'URGENT',
          title: label,
          detail:
            order.paymentStatus === 'FAILED'
              ? 'Payment failed · review the original attempt'
              : 'Payment pending for over 10 min · verify before collecting again'
        });
    }
    items.sort(
      (a, b) =>
        Number(b.priority === 'URGENT') - Number(a.priority === 'URGENT') ||
        Number(b.kind === 'SERVICE') - Number(a.kind === 'SERVICE') ||
        Date.parse(a.at) - Date.parse(b.at)
    );
    return {
      scope: branchId,
      checkedAt: new Date(now).toISOString(),
      serviceAvailable,
      total: items.length,
      urgent: items.filter((item) => item.priority === 'URGENT').length,
      servicePending: items.filter((item) => item.kind === 'SERVICE').length,
      items
    };
  }
}
