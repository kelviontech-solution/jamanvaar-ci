import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OrderSyncService } from '../order-sync/order-sync.service';
import { WhatsAppOutboundWebhookService } from '../whatsapp-outbound/whatsapp-outbound-webhook.service';
import { businessDateIn, newPublicOrderId } from '../qr/qr.support';
import { RazorpayGatewayService } from './razorpay-gateway.service';
import { MenuSyncService } from './menu-sync.service';
import { priceCart, PriceValidationError, MenuSnapshotItemLookup } from './pricing.util';
import { CreatePaymentOrderDto } from './dto/create-payment-order.dto';
import { CreateRefundDto } from './dto/create-refund.dto';
import { getDefaultCommissionBps } from './commission.util';
import { buildDayStatement } from './payment-statement.util';

/**
 * What WhatsAppChannelService.checkout() (see whatsapp-channel.service.ts, Phase 4 of
 * docs/integrations/JAMANVAAR_WHATSAPP_CONNECTOR_IMPLEMENTATION_PLAN.md) has already priced
 * (via the same priceCart() QrMenuService feeds channels/menu/quote from) and hands to
 * createChannelOrder to turn into a real Razorpay payment session. No POS/KDS-visible order
 * is created here — only once the Razorpay webhook reports SUCCESS (see the `source ===
 * 'WHATSAPP'` branch in processRazorpayWebhook below) does the order become visible to the
 * restaurant, which is the whole point: a WhatsApp customer's order must never reach the
 * kitchen before they've actually paid for it.
 */
export interface ChannelOrderInput {
  externalOrderId: string;
  source: string; // 'WHATSAPP'
  branchId: string;
  orderType: string; // 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY'
  tableLabel: string | null;
  customerName: string;
  customerPhone: string;
  items: unknown[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
}

/** The restaurant's online payments are not switched on yet (its Razorpay vendor is still being verified, or it is suspended). Clients show this as pending, not as broken. */
export const PAYMENTS_NOT_ACTIVE = 'PAYMENTS_NOT_ACTIVE';
const NON_TERMINAL_STATUSES = ['CREATED', 'PENDING', 'AUTHORIZED'];
const PAID_STATUSES = ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REFUND_PENDING'];
const RAZORPAY_EVENT_STATUS: Record<string, 'SUCCESS' | 'FAILED'> = {
  'payment.captured': 'SUCCESS',
  'qr_code.credited': 'SUCCESS',
  'payment.failed': 'FAILED',
  'payment_link.paid': 'SUCCESS',
  'payment_link.expired': 'FAILED',
  'payment_link.cancelled': 'FAILED'
};
/** A UPI QR stops working after this long; the kiosk shows the same countdown. */
export const QR_MIN_REMAINING_MS = 30_000;
const STATUS_WEBHOOK_GRACE_MS = 15_000;
const QR_TTL_SECONDS = 180;
/** A paid order with no token/KOT after this long is surfaced as needing attention. */
export const ATTENTION_GRACE_MS = 3 * 60 * 1000;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly razorpay: RazorpayGatewayService,
    private readonly menuSync: MenuSyncService,
    private readonly audit: AuditService,
    private readonly orderSync: OrderSyncService,
    private readonly whatsappOutbound: WhatsAppOutboundWebhookService
  ) {}

  async createOrGetPaymentOrder(restaurantId: string, kioskId: string, dto: CreatePaymentOrderDto) {
    const connection = await this.prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } }));

    const existingOrder = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.findUnique({
        where: { restaurantId_externalOrderId: { restaurantId, externalOrderId: dto.externalOrderId } },
        include: { paymentTransactions: { orderBy: { createdAt: 'desc' } } }
      })
    );

    if (existingOrder) {
      const latest = existingOrder.paymentTransactions[0];
      if (existingOrder.status === 'PAID' || (latest && NON_TERMINAL_STATUSES.includes(latest.status))) {
        return this.toOrderResponse(existingOrder, latest);
      }
      // Every prior attempt is terminal-failed: open a fresh attempt at the same, already-validated total.
      const payment = await this.createRazorpayAttempt(existingOrder.id, restaurantId, existingOrder.totalAmount, existingOrder.currency, connection);
      return this.toOrderResponse(existingOrder, payment);
    }

    if (!connection || connection.status !== 'ACTIVE') {
      throw new ForbiddenException({ message: 'Online payments are not active for this restaurant yet', code: PAYMENTS_NOT_ACTIVE });
    }

    const menuItems = await this.menuSync.loadItemsByExternalIds(restaurantId, dto.lines.map((l) => l.externalItemId));
    const lookup = new Map<string, MenuSnapshotItemLookup>(
      menuItems.map((item) => [
        item.externalItemId,
        {
          externalItemId: item.externalItemId,
          name: item.name,
          basePrice: item.basePrice,
          taxRate: item.taxRate,
          isAvailable: item.isAvailable,
          modifierGroups: (item.modifierGroups as unknown as MenuSnapshotItemLookup['modifierGroups']) ?? []
        }
      ])
    );

    let priced;
    try {
      priced = priceCart(dto.lines, lookup);
    } catch (err) {
      if (err instanceof PriceValidationError) throw new BadRequestException(err.message);
      throw err;
    }

    const order = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({
        data: {
          restaurantId,
          kioskId,
          externalOrderId: dto.externalOrderId,
          items: priced.lines as unknown as Prisma.InputJsonValue,
          subtotal: priced.subtotal,
          taxAmount: priced.taxAmount,
          discountAmount: 0,
          totalAmount: priced.totalAmount,
          status: 'PENDING_PAYMENT'
        }
      })
    );

    const payment = await this.createRazorpayAttempt(order.id, restaurantId, order.totalAmount, order.currency, connection);
    return this.toOrderResponse(order, payment);
  }

  /**
   * The WhatsApp connector's equivalent of createOrGetPaymentOrder above — same idempotency-by-
   * externalOrderId, same "restaurant must have an ACTIVE Razorpay connection" gate, same
   * createRazorpayAttempt for the actual Razorpay order + commission split. The only real
   * difference: the caller (WhatsAppChannelService.checkout) has already priced the cart itself
   * (from QrMenuService's lookup, not MenuSyncService's — see that method's own comment), so this
   * takes the priced lines directly instead of pricing dto.lines here.
   */
  async createChannelOrder(restaurantId: string, input: ChannelOrderInput) {
    const connection = await this.prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } }));

    const existingOrder = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.findUnique({
        where: { restaurantId_externalOrderId: { restaurantId, externalOrderId: input.externalOrderId } },
        include: { paymentTransactions: { orderBy: { createdAt: 'desc' } } }
      })
    );

    if (existingOrder) {
      const latest = existingOrder.paymentTransactions[0];
      if (existingOrder.status === 'PAID' || (latest && NON_TERMINAL_STATUSES.includes(latest.status))) {
        return this.toChannelOrderResponse(existingOrder, latest);
      }
      const payment = await this.createRazorpayLinkAttempt(existingOrder.id, restaurantId, existingOrder.totalAmount, existingOrder.currency, input.customerName, input.customerPhone, connection);
      return this.toChannelOrderResponse(existingOrder, payment);
    }

    if (!connection || connection.status !== 'ACTIVE') {
      throw new ForbiddenException({ message: 'Online payments are not active for this restaurant yet', code: PAYMENTS_NOT_ACTIVE });
    }

    const order = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({
        data: {
          restaurantId,
          kioskId: null,
          externalOrderId: input.externalOrderId,
          source: input.source,
          branchId: input.branchId,
          orderType: input.orderType,
          tableLabel: input.tableLabel,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          items: input.items as unknown as Prisma.InputJsonValue,
          subtotal: input.subtotal,
          taxAmount: input.taxAmount,
          discountAmount: 0,
          totalAmount: input.totalAmount,
          status: 'PENDING_PAYMENT'
        }
      })
    );

    const payment = await this.createRazorpayLinkAttempt(order.id, restaurantId, order.totalAmount, order.currency, input.customerName, input.customerPhone, connection);
    return this.toChannelOrderResponse(order, payment);
  }

  private toChannelOrderResponse(
    order: { id: string; totalAmount: number; currency: string },
    payment: { id: string; status: string; providerResponse: Prisma.JsonValue }
  ) {
    const linkUrl = payment.providerResponse && typeof payment.providerResponse === 'object' && !Array.isArray(payment.providerResponse)
      ? (payment.providerResponse as Record<string, unknown>).linkUrl
      : undefined;
    return {
      orderId: order.id,
      paymentId: payment.id,
      paymentLink: typeof linkUrl === 'string' ? linkUrl : null,
      amount: order.totalAmount,
      currency: order.currency,
      status: payment.status
    };
  }

  /** Shared by the kiosk QR and WhatsApp payment paths so both compute platform commission identically. */
  private async commissionSplitFor(amount: number, connection: { commissionOverrideBps: number | null } | null) {
    const commissionBps = connection?.commissionOverrideBps ?? (await getDefaultCommissionBps(this.prisma));
    const platformAmount = Math.round((amount * commissionBps) / 10000);
    const restaurantAmount = amount - platformAmount;
    return { commissionBps, platformAmount, restaurantAmount };
  }

  private async createRazorpayAttempt(orderId: string, restaurantId: string, amount: number, currency: string, connection: { commissionOverrideBps: number | null } | null) {
    const { commissionBps, platformAmount, restaurantAmount } = await this.commissionSplitFor(amount, connection);

    return this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({
        data: { orderId, restaurantId, provider: 'RAZORPAY', providerOrderId: randomUUID(), amount, currency, status: 'PENDING', commissionBps, platformAmount, restaurantAmount }
      })
    );
  }

  /**
   * The WhatsApp connector's payment link (https://razorpay.com/docs/api/payments/payment-links/create/). The link id
   * is our own reference, stored as providerOrderId, so webhook events can find this payment.
   */
  private async createRazorpayLinkAttempt(
    orderId: string,
    restaurantId: string,
    amount: number,
    currency: string,
    customerName: string,
    customerPhone: string,
    connection: { commissionOverrideBps: number | null } | null
  ) {
    const { commissionBps, platformAmount, restaurantAmount } = await this.commissionSplitFor(amount, connection);
    const reference = `wapay_${randomUUID()}`;

    const payment = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({
        data: { orderId, restaurantId, provider: 'RAZORPAY', providerOrderId: reference, amount, currency, status: 'CREATED', commissionBps, platformAmount, restaurantAmount }
      })
    );

    // A stuck order is never worth chasing forever: 30 minutes, not the 24h default of a generic payment link.
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const link = await this.razorpay.createPaymentLink({
      referenceId: reference,
      amountPaise: amount,
      description: 'Order via WhatsApp',
      customerName,
      customerPhone,
      expireByUnix: Math.floor(expiresAt.getTime() / 1000)
    });

    return this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.update({
        where: { id: payment.id },
        data: { status: 'PENDING', providerResponse: { linkId: link.linkId, linkUrl: link.shortUrl, linkStatus: link.status } as unknown as Prisma.InputJsonValue }
      })
    );
  }

  private toOrderResponse(
    order: { id: string; totalAmount: number; currency: string },
    payment: { id: string; status: string }
  ) {
    return { orderId: order.id, paymentId: payment.id, amount: order.totalAmount, currency: order.currency, status: payment.status };
  }

  async tenantSummary(restaurantId: string, filters: { from?: Date; to?: Date }) {
    return this.prisma.runAsTenant(restaurantId, async (tx) => {
      const where = { restaurantId, ...(filters.from || filters.to ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } } : {}) };
      const [successAgg, failedCount, refunded] = await Promise.all([
        tx.paymentTransaction.aggregate({ where: { ...where, status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'] } }, _sum: { amount: true }, _count: true }),
        tx.paymentTransaction.count({ where: { ...where, status: 'FAILED' } }),
        tx.refund.aggregate({ where: { status: 'SUCCESS', payment: { restaurantId } }, _sum: { amount: true } })
      ]);
      return {
        grossVolume: successAgg._sum.amount ?? 0,
        successfulCount: successAgg._count,
        failedCount,
        refundedAmount: refunded._sum.amount ?? 0
      };
    });
  }

  /**
   * A UPI QR for one pending payment, rendered by Razorpay and shown on the kiosk. The QR is only created for a
   * payment that is still open and only while the restaurant's payment connection is ACTIVE, so a suspended
   * restaurant stops taking new payments immediately.
   */
  async createUpiQr(restaurantId: string, paymentId: string) {
    const payment = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.findFirst({ where: { id: paymentId, restaurantId } })
    );
    if (!payment) throw new NotFoundException('Payment not found');
    if (!NON_TERMINAL_STATUSES.includes(payment.status)) {
      throw new BadRequestException(`Cannot create a QR for a payment in status ${payment.status}`);
    }
    const connection = await this.prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } }));
    if (!connection || connection.status !== 'ACTIVE') {
      throw new ForbiddenException({ message: 'Online payments are not active for this restaurant', code: PAYMENTS_NOT_ACTIVE });
    }

    return this.prisma.runAsTenant(restaurantId, async (tx) => {
      // One live QR per payment: the row is locked while a QR is created, so two taps cannot produce two QRs,
      // and a QR that is still valid is returned instead of creating another.
      const [locked] = await tx.$queryRaw<{ providerResponse: Prisma.JsonValue | null }[]>`
        SELECT "providerResponse" FROM "PaymentTransaction" WHERE id = ${paymentId} AND "restaurantId" = ${restaurantId} FOR UPDATE
      `;
      const existing = (locked?.providerResponse ?? null) as { qr?: { id: string; imageUrl: string; expiresAt: string } } | null;
      if (existing?.qr && Date.parse(existing.qr.expiresAt) - Date.now() > QR_MIN_REMAINING_MS) {
        return { qrPayload: existing.qr.imageUrl, contentType: 'image/url', expiresAt: existing.qr.expiresAt, method: 'UPI_QR' as const };
      }

      const expiresAt = new Date(Date.now() + QR_TTL_SECONDS * 1000);
      const qr = await this.razorpay.createUpiQr({
        paymentRef: payment.providerOrderId,
        amountPaise: payment.amount,
        closeByUnix: Math.floor(expiresAt.getTime() / 1000),
        description: `Order ${payment.orderId.slice(0, 8)}`
      });
      if (!qr.imageUrl) throw new ServiceUnavailableException('Razorpay did not return a QR image for this payment');
      const stored = { qr: { id: qr.qrId, imageUrl: qr.imageUrl, expiresAt: expiresAt.toISOString() } };
      await tx.paymentTransaction.update({ where: { id: paymentId }, data: { providerResponse: stored as unknown as Prisma.InputJsonValue } });
      return { qrPayload: qr.imageUrl, contentType: 'image/url', expiresAt: expiresAt.toISOString(), method: 'UPI_QR' as const };
    });
  }

  /**
   * Called once the token and KOT exist for a paid order (by the kiosk itself, or by staff clearing a
   * stuck one). Idempotent: the first stamp wins. A SUCCESS payment that is never stamped is what the
   * "needs attention" lists are built from.
   */
  /**
   * The kitchen ticket claim for one paid kiosk order. Exactly one caller ever gets claimed: true, decided by an
   * atomic conditional update, so two kiosks (or a retry) cannot both print the ticket for the same payment.
   */
  async claimKitchenTicket(restaurantId: string, paymentId: string, device: { id: string; type: string }) {
    const payment = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.findFirst({ where: { id: paymentId, restaurantId }, select: { id: true, status: true, kotClaimedAt: true } })
    );
    if (!payment) throw new NotFoundException('Payment not found');
    if (!PAID_STATUSES.includes(payment.status)) {
      throw new BadRequestException(`Cannot claim a kitchen ticket for a payment in status ${payment.status}`);
    }
    const claimedAt = new Date();
    const changed = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.updateMany({ where: { id: paymentId, restaurantId, kotClaimedAt: null }, data: { kotClaimedAt: claimedAt } })
    );
    if (changed.count === 1) {
      await this.prisma.runAsTenant(restaurantId, (tx) =>
        this.audit.log({ actorType: 'TENANT', actorId: device.id, restaurantId, action: 'KITCHEN_TICKET_CLAIMED', category: 'PAYMENTS', details: { paymentId, deviceType: device.type } }, tx)
      );
      return { claimed: true, claimedAt };
    }
    const existing = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId }, select: { kotClaimedAt: true } })
    );
    return { claimed: false, claimedAt: existing.kotClaimedAt };
  }

  async markFulfilled(restaurantId: string, paymentId: string, device: { id: string; type: string }) {
    const payment = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.findFirst({ where: { id: paymentId, restaurantId } })
    );
    if (!payment) throw new NotFoundException('Payment not found');
    if (!PAID_STATUSES.includes(payment.status)) {
      throw new BadRequestException(`Cannot mark a payment in status ${payment.status} as fulfilled`);
    }
    if (payment.fulfilledAt) return { fulfilledAt: payment.fulfilledAt };

    const stamp = new Date();
    await this.prisma.runAsTenant(restaurantId, async (tx) => {
      const changed = await tx.paymentTransaction.updateMany({ where: { id: paymentId, fulfilledAt: null }, data: { fulfilledAt: stamp, fulfilledByDeviceId: device.id } });
      if (changed.count > 0 && device.type !== 'KIOSK') {
        await this.audit.log(
          { actorType: 'TENANT', actorId: device.id, restaurantId, action: 'PAYMENT_MARKED_FULFILLED', category: 'PAYMENTS', details: { paymentId, deviceType: device.type } },
          tx
        );
      }
    });
    const after = await this.prisma.runAsTenant(restaurantId, (tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId } }));
    return { fulfilledAt: after.fulfilledAt };
  }

  /** The latest online payments for a restaurant, with the two things staff act on: paid-but-unserved and refundable balance. */
  async tenantRecent(restaurantId: string, limit = 30) {
    const rows = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.findMany({
        where: { restaurantId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(100, Math.max(1, limit)),
        include: { order: { select: { externalOrderId: true } }, refunds: { select: { amount: true, status: true } } }
      })
    );
    const now = Date.now();
    return {
      rows: rows.map((p) => {
        const refundedAmount = p.refunds.filter((r) => r.status === 'SUCCESS').reduce((s, r) => s + r.amount, 0);
        const committed = p.refunds.filter((r) => r.status === 'SUCCESS' || r.status === 'PENDING').reduce((s, r) => s + r.amount, 0);
        const paidAt = p.paidAt ?? p.createdAt;
        return {
          id: p.id,
          externalOrderId: p.order.externalOrderId,
          amount: p.amount,
          status: p.status,
          method: p.method,
          paidAt: p.paidAt,
          createdAt: p.createdAt,
          fulfilledAt: p.fulfilledAt,
          refundedAmount,
          refundableAmount: p.status === 'SUCCESS' || p.status === 'PARTIALLY_REFUNDED' ? Math.max(0, p.amount - committed) : 0,
          needsAttention: p.status === 'SUCCESS' && !p.fulfilledAt && now - paidAt.getTime() > ATTENTION_GRACE_MS
        };
      })
    };
  }

  async tenantStatement(restaurantId: string, date: string | undefined) {
    return this.prisma.runAsTenant(restaurantId, (tx) => buildDayStatement(tx, restaurantId, date));
  }

  async getPaymentStatus(restaurantId: string, paymentId: string) {
    let payment = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.findFirst({ where: { id: paymentId, restaurantId }, include: { order: true } })
    );
    if (!payment) throw new NotFoundException('Payment not found');
    const current = payment;
    const qrId = (current.providerResponse as { qr?: { id?: string } } | null)?.qr?.id;
    // Give Razorpay's webhook a short head start: a confirmed payment then reaches the kiosk with no extra lookup.
    const webhookGraceOver = Date.now() - current.createdAt.getTime() > STATUS_WEBHOOK_GRACE_MS;
    if (current.provider === 'RAZORPAY' && qrId && webhookGraceOver && NON_TERMINAL_STATUSES.includes(current.status)) {
      const paid = (await this.razorpay.listQrPayments(qrId)).find((p) => p.status === 'captured' && p.amount === current.amount && p.currency === current.currency);
      if (paid) {
        await this.settleRazorpayPayment(current, 'SUCCESS', paid.id, paid, null, false);
        payment = await this.prisma.runAsTenant(restaurantId, (tx) =>
          tx.paymentTransaction.findFirst({ where: { id: paymentId, restaurantId }, include: { order: true } })
        );
        if (!payment) throw new NotFoundException('Payment not found');
      }
    }
    return { paymentId: payment.id, orderId: payment.orderId, status: payment.status, amount: payment.amount, currency: payment.currency, orderStatus: payment.order.status };
  }

  async createRefund(restaurantId: string, paymentId: string, dto: CreateRefundDto, device: { id: string; type: string }, actorType: 'TENANT' | 'PLATFORM' = 'TENANT') {
    // security-audit LOW-02: the status check, the remaining-balance
    // aggregate, and the refund insert used to be three separate
    // runAsTenant calls — three separate transactions — so two concurrent
    // refund requests could both read the same "remaining" balance before
    // either had inserted its row, and both pass the check. This is now one
    // transaction that takes a row lock on the PaymentTransaction first
    // (`FOR UPDATE`), so a second concurrent request blocks until the first
    // commits and then sees its refund in the aggregate.
    const { refund, providerOrderId, provider, providerPaymentId } = await this.prisma.runAsTenant(restaurantId, async (tx) => {
      const locked = await tx.$queryRaw<{ id: string; status: string; amount: number; providerOrderId: string; provider: string; providerPaymentId: string | null }[]>`
        SELECT id, status, amount, "providerOrderId", provider::text AS provider, "providerPaymentId" FROM "PaymentTransaction" WHERE id = ${paymentId} AND "restaurantId" = ${restaurantId} FOR UPDATE
      `;
      const payment = locked[0];
      if (!payment) throw new NotFoundException('Payment not found');

      if (payment.status !== 'SUCCESS' && payment.status !== 'PARTIALLY_REFUNDED') {
        throw new BadRequestException(`Cannot refund a payment in status ${payment.status}`);
      }

      // PENDING counts against the remaining balance too, not just SUCCESS — a
      // second refund request issued before the first's webhook lands must not
      // be approved against the same remaining balance.
      const committed = await tx.refund.aggregate({
        where: { paymentId: payment.id, status: { in: ['SUCCESS', 'PENDING'] } },
        _sum: { amount: true }
      });
      const alreadyCommitted = committed._sum.amount ?? 0;
      const remaining = payment.amount - alreadyCommitted;
      if (dto.amountPaise > remaining) {
        throw new BadRequestException(`Refund amount ${dto.amountPaise} exceeds remaining refundable amount ${remaining}`);
      }

      const created = await tx.refund.create({
        data: {
          paymentId: payment.id,
          restaurantId,
          amount: dto.amountPaise,
          reason: dto.reason,
          requestedBy: dto.requestedBy,
          status: 'PENDING'
        }
      });

      await this.audit.log(
        {
          actorType,
          actorId: device.id,
          restaurantId,
          action: 'REFUND_REQUESTED',
          category: 'PAYMENTS',
          details: { paymentId: payment.id, refundId: created.id, amountPaise: dto.amountPaise, requestedBy: dto.requestedBy, deviceType: device.type, reason: dto.reason }
        },
        tx
      );

      return { refund: created, providerOrderId: payment.providerOrderId, provider: payment.provider, providerPaymentId: payment.providerPaymentId };
    });

    if (provider === 'RAZORPAY') {
      if (!providerPaymentId) {
        await this.prisma.runAsTenant(restaurantId, (tx) => tx.refund.update({ where: { id: refund.id }, data: { status: 'FAILED' } }));
        throw new ConflictException('This payment has no Razorpay payment id to refund against');
      }
      let rzp;
      try {
        rzp = await this.razorpay.createRefund({ razorpayPaymentId: providerPaymentId, amountPaise: dto.amountPaise, receipt: refund.id, notes: { refund_id: refund.id } });
      } catch (err) {
        await this.prisma.runAsTenant(restaurantId, (tx) => tx.refund.update({ where: { id: refund.id }, data: { status: 'FAILED' } }));
        throw err;
      }
      const rzpStatus = rzp.status === 'processed' ? 'SUCCESS' : 'PENDING';
      await this.prisma.runAsTenant(restaurantId, async (tx) => {
        await tx.refund.update({ where: { id: refund.id }, data: { providerRefundId: rzp.refundId, status: rzpStatus } });
        const done = await tx.refund.aggregate({ where: { paymentId, status: 'SUCCESS' }, _sum: { amount: true } });
        const refundedSoFar = done._sum.amount ?? 0;
        const payment = await tx.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId } });
        const nextStatus = rzpStatus === 'PENDING' ? 'REFUND_PENDING' : refundedSoFar >= payment.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
        await tx.paymentTransaction.update({ where: { id: paymentId }, data: { status: nextStatus } });
      });
      return { refundId: refund.id, providerRefundId: rzp.refundId, status: rzp.status, amount: dto.amountPaise };
    }

  }

  async processRazorpayWebhook(rawBody: Buffer, signature: string | undefined, eventId?: string): Promise<void> {
    const signatureValid = Boolean(signature && this.razorpay.verifyWebhookSignature(rawBody, signature));
    const parsed = this.safeParseJson(rawBody);
    if (!signatureValid || parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      await this.prisma.runAsPlatform((tx) =>
        tx.webhookEvent.create({
          data: {
            provider: 'RAZORPAY',
            providerEventKey: `REJECTED:${randomUUID()}`,
            eventType: 'UNKNOWN',
            rawPayload: this.safeParseJson(rawBody) ?? { unparsable: true },
            signatureValid,
            processingStatus: 'FAILED',
            errorMessage: signatureValid ? 'Malformed webhook payload JSON' : 'Invalid or missing webhook signature'
          }
        })
      );
      return;
    }

    const payload = parsed as Record<string, any>;
    const eventType: string = payload.event;
    if (eventType === 'refund.processed' || eventType === 'refund.failed') {
      await this.handleRazorpayRefundEvent(payload, eventType, eventId);
      return;
    }

    const paymentEntity = payload.payload?.payment?.entity;
    const linkEntity = payload.payload?.payment_link?.entity;
    const qrEntity = payload.payload?.qr_code?.entity;
    const paymentRef: string | undefined = linkEntity?.reference_id ?? paymentEntity?.notes?.payment_ref ?? qrEntity?.notes?.payment_ref;
    const razorpayPaymentId: string | undefined = paymentEntity?.id;
    // Razorpay's X-Razorpay-Event-Id is unique per event and repeats on every retry, so it is the deduplication key.
    const providerEventKey = eventId ? `event:${eventId}` : `${eventType}:${razorpayPaymentId ?? linkEntity?.id ?? qrEntity?.id ?? randomUUID()}`;

    const existing = await this.prisma.runAsPlatform((tx) =>
      tx.webhookEvent.findUnique({ where: { provider_providerEventKey: { provider: 'RAZORPAY', providerEventKey } } })
    );
    if (existing && existing.processingStatus !== 'FAILED') {
      await this.prisma.runAsPlatform((tx) =>
        tx.webhookEvent.update({ where: { id: existing.id }, data: { retryCount: { increment: 1 }, processingStatus: 'IGNORED_DUPLICATE' } })
      );
      return;
    }
    const webhookEvent = existing
      ? await this.prisma.runAsPlatform((tx) =>
          tx.webhookEvent.update({
            where: { id: existing.id },
            data: { rawPayload: payload, signatureValid: true, processingStatus: 'VERIFIED', errorMessage: null, retryCount: { increment: 1 } }
          })
        )
      : await this.prisma.runAsPlatform((tx) =>
          tx.webhookEvent.create({ data: { provider: 'RAZORPAY', providerEventKey, eventType, rawPayload: payload, signatureValid: true, processingStatus: 'VERIFIED' } })
        );

    const newStatus = RAZORPAY_EVENT_STATUS[eventType];
    if (!newStatus) {
      await this.markWebhookProcessed(webhookEvent.id);
      return;
    }
    if (!paymentRef) {
      await this.markWebhookFailed(webhookEvent.id, 'Missing payment reference in webhook');
      return;
    }

    const payment = await this.prisma.runAsPlatform((tx) =>
      tx.paymentTransaction.findUnique({ where: { provider_providerOrderId: { provider: 'RAZORPAY', providerOrderId: paymentRef } }, include: { order: true } })
    );
    if (!payment) {
      await this.markWebhookFailed(webhookEvent.id, `No PaymentTransaction found for payment reference ${paymentRef}`);
      return;
    }
    await this.prisma.runAsPlatform((tx) => tx.webhookEvent.update({ where: { id: webhookEvent.id }, data: { restaurantId: payment.restaurantId } }));

    if (newStatus === 'SUCCESS') {
      const amount = paymentEntity?.amount ?? linkEntity?.amount;
      const currency = paymentEntity?.currency ?? linkEntity?.currency;
      if (amount !== payment.amount || currency !== payment.currency) {
        await this.markWebhookFailed(webhookEvent.id, `Amount/currency mismatch: expected ${payment.amount} ${payment.currency}, got ${amount} ${currency}`);
        return;
      }
    }

    if (['SUCCESS', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(payment.status)) {
      if (payment.status === 'SUCCESS') {
        const err = await this.ingestWhatsAppOrderIfNeeded(payment);
        if (err) {
          await this.markWebhookFailed(webhookEvent.id, err);
          return;
        }
      }
      await this.markWebhookProcessed(webhookEvent.id);
      return;
    }

    const err = await this.settleRazorpayPayment(
      payment,
      newStatus,
      razorpayPaymentId,
      payload,
      paymentEntity?.error_description ?? (newStatus === 'FAILED' ? linkEntity?.status ?? null : null),
      true
    );
    if (err) {
      await this.markWebhookFailed(webhookEvent.id, err);
      return;
    }
    await this.markWebhookProcessed(webhookEvent.id);
  }

  /** A refund that Razorpay confirms or rejects: updates the Refund row and the payment's refunded state. */
  private async handleRazorpayRefundEvent(payload: Record<string, any>, eventType: string, eventId?: string): Promise<void> {
    const refundEntity = payload.payload?.refund?.entity;
    const providerRefundId: string | undefined = refundEntity?.id;
    const providerEventKey = eventId ? `event:${eventId}` : `${eventType}:${providerRefundId ?? randomUUID()}`;
    const existing = await this.prisma.runAsPlatform((tx) =>
      tx.webhookEvent.findUnique({ where: { provider_providerEventKey: { provider: 'RAZORPAY', providerEventKey } } })
    );
    if (existing && existing.processingStatus !== 'FAILED') {
      await this.prisma.runAsPlatform((tx) =>
        tx.webhookEvent.update({ where: { id: existing.id }, data: { retryCount: { increment: 1 }, processingStatus: 'IGNORED_DUPLICATE' } })
      );
      return;
    }
    const webhookEvent = existing
      ? await this.prisma.runAsPlatform((tx) =>
          tx.webhookEvent.update({ where: { id: existing.id }, data: { rawPayload: payload, signatureValid: true, processingStatus: 'VERIFIED', errorMessage: null } })
        )
      : await this.prisma.runAsPlatform((tx) =>
          tx.webhookEvent.create({ data: { provider: 'RAZORPAY', providerEventKey, eventType, rawPayload: payload, signatureValid: true, processingStatus: 'VERIFIED' } })
        );

    const refund = providerRefundId
      ? await this.prisma.runAsPlatform((tx) => tx.refund.findFirst({ where: { providerRefundId }, include: { payment: true } }))
      : null;
    if (!refund) {
      await this.markWebhookFailed(webhookEvent.id, `No Refund found for ${providerRefundId ?? 'missing id'}`);
      return;
    }
    await this.prisma.runAsPlatform((tx) => tx.webhookEvent.update({ where: { id: webhookEvent.id }, data: { restaurantId: refund.restaurantId } }));
    if (refundEntity?.amount !== refund.amount) {
      await this.markWebhookFailed(webhookEvent.id, `Refund amount mismatch: expected ${refund.amount}, got ${refundEntity?.amount}`);
      return;
    }

    const refundStatus = eventType === 'refund.processed' ? 'SUCCESS' : 'FAILED';
    await this.prisma.runAsTenant(refund.restaurantId, async (tx) => {
      await tx.refund.update({ where: { id: refund.id }, data: { status: refundStatus } });
      const done = await tx.refund.aggregate({ where: { paymentId: refund.paymentId, status: 'SUCCESS' }, _sum: { amount: true } });
      const pending = await tx.refund.count({ where: { paymentId: refund.paymentId, status: 'PENDING' } });
      const refundedSoFar = done._sum.amount ?? 0;
      const nextStatus = pending > 0 ? 'REFUND_PENDING' : refundedSoFar >= refund.payment.amount ? 'REFUNDED' : refundedSoFar > 0 ? 'PARTIALLY_REFUNDED' : 'SUCCESS';
      await tx.paymentTransaction.update({ where: { id: refund.paymentId }, data: { status: nextStatus } });
      await tx.order.update({ where: { id: refund.payment.orderId }, data: { status: nextStatus === 'REFUNDED' ? 'REFUNDED' : 'PAID' } });
    });
    await this.markWebhookProcessed(webhookEvent.id);
  }

  /** Records a Razorpay outcome on the payment and its order. Returns an error message when the WhatsApp order could not be created. */
  private async settleRazorpayPayment(
    payment: {
      id: string;
      restaurantId: string;
      orderId: string;
      amount: number;
      currency: string;
      providerOrderId: string;
      order: { externalOrderId: string; source: string; branchId: string | null; orderType: string | null; tableLabel: string | null; customerName: string | null; customerPhone: string | null; items: Prisma.JsonValue; subtotal: number; taxAmount: number; totalAmount: number } | null;
    },
    newStatus: 'SUCCESS' | 'FAILED',
    razorpayPaymentId: string | undefined,
    providerResponse: unknown,
    failureReason: string | null,
    fromWebhook: boolean
  ): Promise<string | null> {
    await this.prisma.runAsTenant(payment.restaurantId, async (tx) => {
      await tx.paymentTransaction.update({
        where: { id: payment.id },
        data: {
          status: newStatus,
          providerPaymentId: razorpayPaymentId,
          providerResponse: providerResponse as Prisma.InputJsonValue,
          failureReason: newStatus === 'SUCCESS' ? null : failureReason,
          paidAt: newStatus === 'SUCCESS' ? new Date() : null
        }
      });
      await tx.order.update({ where: { id: payment.orderId }, data: { status: newStatus === 'SUCCESS' ? 'PAID' : 'PAYMENT_FAILED' } });
      await tx.restaurantPaymentConnection.updateMany({
        where: { restaurantId: payment.restaurantId },
        data: {
          ...(fromWebhook ? { lastWebhookAt: new Date() } : {}),
          ...(newStatus === 'SUCCESS' ? { lastPaymentAt: new Date() } : {})
        }
      });
    });

    if (newStatus !== 'SUCCESS') return null;
    return this.ingestWhatsAppOrderIfNeeded(payment);
  }

  /**
   * Makes a paid WhatsApp order appear on POS/KDS — and only a paid one: this is the single
   * place that call happens, reached only from a payment already confirmed SUCCESS by Razorpay
   * (fresh, or on a retried delivery — see the two call sites above). A restaurant-side order
   * created at checkout time instead would mean the kitchen sees an order before anyone has
   * actually paid for it, which is the one thing the user building this connector explicitly
   * required never happen. Returns an error message string on failure (never throws), so a
   * WebhookEvent can record the reason `markWebhookFailed` needs.
   */
  private async ingestWhatsAppOrderIfNeeded(payment: {
    id: string;
    restaurantId: string;
    orderId: string;
    order: {
      externalOrderId: string;
      source: string;
      branchId: string | null;
      orderType: string | null;
      tableLabel: string | null;
      customerName: string | null;
      customerPhone: string | null;
      items: Prisma.JsonValue;
      subtotal: number;
      taxAmount: number;
      totalAmount: number;
    } | null;
  }): Promise<string | null> {
    const order = payment.order;
    if (!order || order.source !== 'WHATSAPP') return null;

    try {
      const [restaurant, connection] = await Promise.all([
        this.prisma.runAsPlatform((tx) => tx.restaurant.findUnique({ where: { id: payment.restaurantId }, select: { timezone: true } })),
        this.prisma.runAsTenant(payment.restaurantId, (tx) => tx.whatsAppChannelConnection.findUnique({ where: { restaurantId: payment.restaurantId }, select: { autoAccept: true } }))
      ]);
      const timezone = restaurant?.timezone ?? 'Asia/Kolkata';
      const businessDate = businessDateIn(timezone);

      const result = await this.orderSync.ingestServerOrder({
        restaurantId: payment.restaurantId,
        branchId: order.branchId,
        externalOrderId: order.externalOrderId,
        source: 'WHATSAPP',
        publicOrderId: newPublicOrderId(),
        orderType: order.orderType ?? 'TAKEAWAY',
        status: connection?.autoAccept ? 'PREPARING' : 'NEW',
        tableId: null,
        tableLabel: order.tableLabel,
        items: order.items as unknown[],
        subtotal: order.subtotal,
        taxAmount: order.taxAmount,
        discountAmount: 0,
        totalAmount: order.totalAmount,
        notes: null,
        // The whole reason this method only ever runs from a confirmed-SUCCESS payment.
        paymentStatus: 'SUCCESS',
        paymentMethod: 'RAZORPAY',
        meta: {
          sourceType: 'WHATSAPP',
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          paymentTransactionId: payment.id,
          cgstPaise: Math.round(order.taxAmount / 2),
          sgstPaise: order.taxAmount - Math.round(order.taxAmount / 2)
        },
        beforeCreate: order.branchId
          ? async (tx) => {
              const rows = await tx.$queryRaw<Array<{ next: number }>>`
                INSERT INTO "NumberSequence" ("restaurantId", "scope", "kind", "businessDate", "next")
                VALUES (${payment.restaurantId}, ${order.branchId}, 'WHATSAPP', ${businessDate}, 2)
                ON CONFLICT ("restaurantId", "scope", "kind", "businessDate") DO UPDATE SET "next" = "NumberSequence"."next" + 1
                RETURNING "next"`;
              const number = `WA-${Number(rows[0].next) - 1}`;
              return { tokenNumber: number, orderNumber: number };
            }
          : undefined
      });

      // Only on a genuinely fresh ingestion, matching ingestServerOrder's own "only publish
      // after commit if not a duplicate" rule — a redelivered webhook whose ingestion had
      // already succeeded once must not send product/whatsapp a second order.confirmed for
      // the same order. paymentId is the correlator: it's the same id checkout()'s response
      // already gave product/whatsapp (JamanvaarFulfillmentSink stores it on
      // Engagement.gateway_metadata.jamanvaar_payment_id), so no new kiosk-side field is
      // needed to let product/whatsapp find its own record for this order.
      if (!result.duplicate) {
        // Isolated from the catch below on purpose: KDS ingestion (the part that matters
        // for the "order reaches the kitchen only after payment" guarantee) already
        // committed successfully by this point. enqueue() itself already durably records
        // the delivery and retries on its own — a failure here is a bug worth logging, not
        // a reason to make markWebhookFailed retry a webhook whose real job is done.
        try {
          await this.whatsappOutbound.enqueue(payment.restaurantId, 'order.confirmed', {
            paymentId: payment.id,
            orderId: payment.orderId,
            publicOrderId: result.order.publicOrderId,
            status: result.order.status
          });
        } catch {
          // enqueue() only ever throws from the initial row-insert (its own delivery
          // attempt already swallows and records failures) — nothing more to do here.
        }
      }
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Unknown error ingesting WhatsApp order into POS/KDS';
    }
  }

  private async markWebhookProcessed(id: string): Promise<void> {
    await this.prisma.runAsPlatform((tx) => tx.webhookEvent.update({ where: { id }, data: { processingStatus: 'PROCESSED', processedAt: new Date() } }));
  }

  private async markWebhookFailed(id: string, errorMessage: string): Promise<void> {
    await this.prisma.runAsPlatform((tx) => tx.webhookEvent.update({ where: { id }, data: { processingStatus: 'FAILED', errorMessage, processedAt: new Date() } }));
  }

  /** Returns the parsed JSON value, or `null` if `rawBody` isn't valid JSON — callers that
   *  need a fallback payload for storage (rather than a failure signal) should use `?? { unparsable: true }`. */
  private safeParseJson(rawBody: Buffer): Prisma.InputJsonValue | null {
    try {
      return JSON.parse(rawBody.toString('utf8'));
    } catch {
      return null;
    }
  }
}
