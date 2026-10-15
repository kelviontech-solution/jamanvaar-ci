import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OperationsService, OpsScope } from './operations.service';
import { PaymentsService } from '../payments/payments.service';
import { DeviceCommandsService } from '../device-commands/device-commands.service';
import { branchWaitEstimate } from './wait-estimate';
import { paymentBalance } from '../payments/order-payment-ledger';
const object = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const finals = ['SERVED', 'COMPLETED', 'CANCELLED', 'VOID', 'VOIDED', 'REFUNDED'];
@Injectable()
export class ServiceMaturityService {
  constructor(
    private readonly ops: OperationsService,
    private readonly payments: PaymentsService,
    private readonly commands: DeviceCommandsService
  ) {}
  async exceptions(s: OpsScope) {
    return this.ops.prisma.runAsTenant(s.restaurantId, async (tx) => {
      const [payments, orders, assigned] = await Promise.all([
        tx.paymentTransaction.findMany({
          where: {
            restaurantId: s.restaurantId,
            order: { OR: [{ branchId: s.branchId }, { branchId: null, kiosk: { branchId: s.branchId } }] },
            createdAt: { gte: new Date(Date.now() - 90 * 86400000) }
          },
          include: { order: { select: { externalOrderId: true, totalAmount: true } }, refunds: true },
          orderBy: { createdAt: 'desc' },
          take: 1000
        }),
        tx.syncedOrder.findMany({
          where: { restaurantId: s.restaurantId, branchId: s.branchId, createdAt: { gte: new Date(Date.now() - 90 * 86400000) } },
          include: { paymentEntries: true },
          orderBy: { createdAt: 'desc' },
          take: 1000
        }),
        tx.syncedEntity.findMany({
          where: { restaurantId: s.restaurantId, entityType: 'OPS_PAYMENT_CASE', payload: { path: ['branchId'], equals: s.branchId } }
        })
      ]);
      const cases: Array<Record<string, any>> = [],
        allocations = new Map(assigned.map((r) => [r.externalId, { version: r.syncVersion, ...object(r.payload) }]));
      const add = (id: string, kind: string, reference: string, title: string, paymentId?: string) =>
        cases.push({
          id,
          kind,
          reference,
          title,
          paymentId: paymentId ?? null,
          ...allocations.get(id),
          href: `?opsTask=history&order=${encodeURIComponent(reference)}`
        });
      for (const p of payments) {
        const ref = p.order.externalOrderId,
          age = Date.now() - p.createdAt.getTime();
        if (p.status === 'SUCCESS' && !p.fulfilledAt && age > 60000)
          add(`fulfil:${p.id}`, 'PAID_UNFULFILLED', ref, 'Payment confirmed; kitchen delivery needs checking', p.id);
        if (['CREATED', 'PENDING'].includes(p.status) && age > 120000)
          add(`pending:${p.id}`, 'PAYMENT_PENDING', ref, 'Payment outcome has not been confirmed', p.id);
        for (const refund of p.refunds.filter((r) => ['PENDING', 'FAILED'].includes(r.status)))
          add(
            `refund:${refund.id}`,
            'REFUND_PENDING',
            ref,
            refund.status === 'FAILED' ? 'Refund failed; review the original refund' : 'Refund is awaiting confirmation',
            p.id
          );
      }
      for (const o of orders) {
        let ledger: ReturnType<typeof paymentBalance> | null = null;
        try {
          ledger = paymentBalance(o.totalAmount, o.paymentEntries);
        } catch {
          /* An inconsistent ledger is the issue to display; the inbox must stay usable. */
        }
        const confirmed = payments.filter(
          (p) => p.order.externalOrderId === o.externalOrderId && ['SUCCESS', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(p.status)
        );
        if (
          confirmed.reduce((n, p) => n + Math.max(0, p.amount - p.refunds.filter((r) => r.status === 'SUCCESS').reduce((sum, r) => sum + r.amount, 0)), 0) >
          o.totalAmount
        )
          add(`duplicate:${o.id}`, 'POSSIBLE_DUPLICATE', o.externalOrderId, 'Confirmed gateway collections exceed the order total; review before refunding');
        if (
          !ledger ||
          (o.paymentEntries.length && ['PAID', 'SUCCESS'].includes(o.paymentStatus ?? '') && ledger.outstandingPaise > 0) ||
          object(o.meta).needsTotalsReview
        )
          add(`ledger:${o.id}`, 'SETTLEMENT_DIFFERENCE', o.externalOrderId, 'Order totals or payment allocations need reconciliation');
      }
      return { cases, limited: payments.length === 1000 || orders.length === 1000, windowDays: 90, generatedAt: new Date().toISOString() };
    });
  }
  async assignCase(s: OpsScope, input: { id: string; assignedTo: string; notes: string; expectedVersion: number }) {
    const current = await this.exceptions(s);
    if (!current.cases.some((c) => c.id === input.id)) throw new NotFoundException('This exception no longer needs attention');
    if (
      input.assignedTo &&
      !(await this.ops.prisma.runAsTenant(s.restaurantId, (tx) =>
        tx.user.findFirst({
          where: {
            id: input.assignedTo,
            restaurantId: s.restaurantId,
            status: 'ACTIVE',
            role: { in: ['OWNER', 'MANAGER'] },
            OR: [{ role: 'OWNER' }, { branchId: s.branchId }]
          }
        })
      ))
    )
      throw new BadRequestException('Choose an active branch manager or owner');
    return this.ops.write(
      s,
      'OPS_PAYMENT_CASE',
      input.id,
      { assignedTo: input.assignedTo, notes: input.notes },
      input.expectedVersion,
      'PAYMENT_EXCEPTION_ASSIGNED'
    );
  }
  async paymentCheck(s: OpsScope, paymentId: string, recover = false) {
    const found = await this.ops.prisma.runAsTenant(s.restaurantId, (tx) =>
      tx.paymentTransaction.findFirst({
        where: { id: paymentId, restaurantId: s.restaurantId, order: { OR: [{ branchId: s.branchId }, { branchId: null, kiosk: { branchId: s.branchId } }] } },
        select: { id: true }
      })
    );
    if (!found) throw new NotFoundException('Payment not found in this branch');
    return recover ? this.payments.recoverConfirmedDelivery(s.restaurantId, paymentId, s.userId) : this.payments.getPaymentStatus(s.restaurantId, paymentId);
  }
  async recovery(s: OpsScope) {
    const [context, inbox] = await Promise.all([this.ops.context(s), this.exceptions(s)]);
    return {
      issues: [
        ...context.orders
          .filter((o) => !finals.includes(o.status) && o.ageMinutes >= 5)
          .map((o) => ({
            id: 'order:' + o.externalOrderId,
            reference: o.externalOrderId,
            kind: 'KITCHEN',
            title: `${o.label}: check kitchen delivery`,
            steps: [
              'Open the original order timeline.',
              'Check the assigned kitchen screen is connected.',
              'Request synchronization; keep the same order and token.'
            ],
            href: `?opsTask=history&order=${encodeURIComponent(o.externalOrderId)}`
          })),
        ...context.devices
          .filter((d) => d.health !== 'online' || d.pendingSyncCount > 0)
          .map((d) => ({
            id: 'device:' + d.id,
            reference: d.id,
            kind: 'DEVICE',
            title: `${d.name || d.type}: connection needs attention`,
            steps: [
              'Check power and network on this device.',
              'Reconnect the same registered device, then request synchronization.',
              'For a printer, open its local print queue; retry the existing job after reconnection.'
            ],
            deviceId: d.id,
            href: `?opsTask=recovery&device=${encodeURIComponent(d.id)}`
          })),
        ...inbox.cases.map((c) => ({
          ...c,
          steps: [
            'Check the original payment reference.',
            'Refresh the provider status before collecting again.',
            'Review confirmed collections and refunds; request an authorized refund only when needed.'
          ]
        }))
      ],
      generatedAt: context.generatedAt
    };
  }
  async retrySync(s: OpsScope, deviceId: string) {
    const actor = await this.ops.prisma.runAsTenant(s.restaurantId, (tx) =>
      tx.device.findFirst({ where: { restaurantId: s.restaurantId, branchId: s.branchId, status: 'ACTIVE', type: 'POS_ADMIN' } })
    );
    if (!actor) throw new BadRequestException('Activate an owner console in this branch before requesting device synchronization');
    return this.commands.issueFromDevice(actor, deviceId, {
      commandType: 'REQUEST_SYNC',
      idempotencyKey: `recovery:${deviceId}:${Math.floor(Date.now() / 60000)}`,
      payload: { scope: 'ALL' }
    });
  }
  async brief(s: OpsScope) {
    const [context, inbox, followup, wait] = await Promise.all([this.ops.context(s), this.exceptions(s), this.ops.list(s, 'OPS_COMPLAINT'), this.wait(s)]);
    const since = new Date();
    const [entries, shortages] = await this.ops.prisma.runAsTenant(s.restaurantId, async (tx) =>
      Promise.all([
        tx.orderPaymentEntry.findMany({
          where: { restaurantId: s.restaurantId, branchId: s.branchId, createdAt: { gte: new Date(Date.now() - 24 * 3600000) } },
          select: { kind: true, amount: true }
        }),
        tx.syncedEntity.findMany({ where: { restaurantId: s.restaurantId, entityType: 'INVENTORY_ITEM' }, select: { externalId: true, payload: true } })
      ])
    );
    return {
      branch: context.branch,
      period: 'Rolling 24 hours',
      generatedAt: since.toISOString(),
      collectionsPaise: entries.filter((e) => e.kind === 'COLLECTION').reduce((n, e) => n + e.amount, 0),
      refundsPaise: entries.filter((e) => e.kind === 'REFUND').reduce((n, e) => n + e.amount, 0),
      outstanding: context.orders.filter((o) => !['PAID', 'SUCCESS', 'REFUNDED'].includes(o.paymentStatus ?? '')),
      exceptions: inbox.cases,
      complaints: followup.filter((c) => object(c).status !== 'RESOLVED'),
      shortages: shortages
        .filter((r) => {
          const p = object(r.payload);
          return (
            !p.deleted && (!p.branchId || p.branchId === s.branchId) && typeof p.currentStock === 'number' && p.currentStock <= Number(p.reorderLevel ?? 0)
          );
        })
        .map((r) => ({ id: r.externalId, name: object(r.payload).name })),
      wait
    };
  }
  async wait(s: Pick<OpsScope, 'restaurantId' | 'branchId'>) {
    return this.ops.prisma.runAsTenant(s.restaurantId, async (tx) => {
      const policy = await tx.syncedEntity.findUnique({
        where: { restaurantId_entityType_externalId: { restaurantId: s.restaurantId, entityType: 'OPS_SERVICE', externalId: s.branchId } }
      });
      return branchWaitEstimate(tx, s.restaurantId, s.branchId, Number(object(policy?.payload).preparationMinutes) || 20);
    });
  }
  async historicalCosts(s: OpsScope) {
    this.ops.require(s, 'POS_ADMIN');
    return this.ops.prisma.runAsTenant(s.restaurantId, async (tx) => {
      const [orders, waste] = await Promise.all([
        tx.syncedOrder.findMany({
          where: {
            restaurantId: s.restaurantId,
            branchId: s.branchId,
            paymentStatus: { in: ['SUCCESS', 'PAID', 'PARTIALLY_REFUNDED'] },
            status: { notIn: ['DRAFT', 'CANCELLED', 'VOID', 'VOIDED'] },
            createdAt: { gte: new Date(Date.now() - 90 * 86400000) }
          },
          include: { paymentEntries: true },
          orderBy: { createdAt: 'desc' },
          take: 5000
        }),
        tx.inventoryMovement.findMany({
          where: {
            restaurantId: s.restaurantId,
            branchId: s.branchId,
            type: { in: ['WASTE', 'SPOILAGE'] },
            occurredAt: { gte: new Date(Date.now() - 90 * 86400000) }
          },
          orderBy: { occurredAt: 'desc' },
          take: 5000
        })
      ]);
      type Day = {
        date: string;
        netSalesPaise: number;
        estimatedFoodCostPaise: number;
        discountPaise: number;
        refundPaise: number;
        wasteCostPaise: number;
        missingCostLines: number;
        missingWasteCosts: number;
      };
      const days = new Map<string, Day>(),
        costs = new Map<string, { id: string; name: string; unit: string; firstCostPaise: number; lastCostPaise: number; firstAt: string; lastAt: string }>();
      const day = (at: Date) => {
        const date = new Intl.DateTimeFormat('en-CA', { timeZone: s.timezone }).format(at);
        if (!days.has(date))
          days.set(date, {
            date,
            netSalesPaise: 0,
            estimatedFoodCostPaise: 0,
            discountPaise: 0,
            refundPaise: 0,
            wasteCostPaise: 0,
            missingCostLines: 0,
            missingWasteCosts: 0
          });
        return days.get(date)!;
      };
      for (const order of orders) {
        const row = day(order.createdAt),
          refunds = order.paymentEntries.filter((e) => e.kind === 'REFUND').reduce((n, e) => n + e.amount, 0),
          netBeforeTax = Math.max(0, order.subtotal - order.discountAmount);
        row.netSalesPaise += Math.round(netBeforeTax * (order.totalAmount ? Math.max(0, order.totalAmount - refunds) / order.totalAmount : 1));
        row.discountPaise += order.discountAmount;
        row.refundPaise += refunds;
        for (const line of Array.isArray(order.items) ? (order.items as any[]) : []) {
          if (line.kitchenStatus === 'CANCELLED') continue;
          const cost = line.foodCostSnapshot;
          if (cost?.complete && typeof cost.unitCostPaise === 'number') row.estimatedFoodCostPaise += Math.round(cost.unitCostPaise * line.quantity);
          else row.missingCostLines++;
          for (const ingredient of cost?.ingredients ?? []) {
            if (typeof ingredient.unitCostPaise !== 'number') continue;
            const id = ingredient.inventoryItemId + ':' + (ingredient.unit ?? ''),
              at = cost.capturedAt ?? order.createdAt.toISOString(),
              prior = costs.get(id);
            if (!prior)
              costs.set(id, {
                id,
                name: ingredient.name ?? ingredient.inventoryItemId,
                unit: ingredient.unit ?? 'stock unit',
                firstCostPaise: ingredient.unitCostPaise,
                lastCostPaise: ingredient.unitCostPaise,
                firstAt: at,
                lastAt: at
              });
            else {
              if (at < prior.firstAt) {
                prior.firstAt = at;
                prior.firstCostPaise = ingredient.unitCostPaise;
              }
              if (at > prior.lastAt) {
                prior.lastAt = at;
                prior.lastCostPaise = ingredient.unitCostPaise;
              }
            }
          }
        }
      }
      for (const movement of waste) {
        const row = day(movement.occurredAt);
        if (movement.unitCostPaise === null) row.missingWasteCosts++;
        else row.wasteCostPaise += Math.round(Math.abs(movement.quantityDelta) * movement.unitCostPaise);
      }
      return {
        days: [...days.values()].sort((a, b) => b.date.localeCompare(a.date)),
        ingredientCosts: [...costs.values()],
        limited: orders.length === 5000 || waste.length === 5000,
        scope: '90 days; ingredient costs frozen when first observed by the server. Older missing costs are not backfilled using current prices.',
        excludes:
          'Labour, overheads and unrecorded waste are excluded. Refunds reduce sales proportionally; this is estimated food margin, not business profit.'
      };
    });
  }
}
