import { randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OrderSyncService } from '../order-sync/order-sync.service';
import { WhatsAppOutboundWebhookService } from '../whatsapp-outbound/whatsapp-outbound-webhook.service';
import { businessDateIn, newPublicOrderId } from '../qr/qr.support';
import { CashfreeGatewayService } from './cashfree-gateway.service';
import { RazorpayGatewayService } from './razorpay-gateway.service';
import type { PaymentPageView } from './payment-page.util';
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
 * createChannelOrder to turn into a real Cashfree payment session. No POS/KDS-visible order
 * is created here — only once the Cashfree webhook reports SUCCESS (see the `source ===
 * 'WHATSAPP'` branch in processCashfreeWebhook below) does the order become visible to the
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

/** The restaurant's online payments are not switched on yet (its Cashfree vendor is still being verified, or it is suspended). Clients show this as pending, not as broken. */
export const PAYMENTS_NOT_ACTIVE = 'PAYMENTS_NOT_ACTIVE';
const NON_TERMINAL_STATUSES = ['CREATED', 'PENDING', 'AUTHORIZED'];
const PAID_STATUSES = ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REFUND_PENDING'];
const RAZORPAY_EVENT_STATUS: Record<string, 'SUCCESS' | 'FAILED'> = {
  'payment.captured': 'SUCCESS',
  'qr_code.credited': 'SUCCESS',
  'payment.failed': 'FAILED'
};
/** A UPI QR stops working after this long; the kiosk shows the same countdown. */
export const QR_TTL_SECONDS = 180;
/** A paid order with no token/KOT after this long is surfaced as needing attention. */
export const ATTENTION_GRACE_MS = 3 * 60 * 1000;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cashfree: CashfreeGatewayService,
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
   * externalOrderId, same "restaurant must have an ACTIVE Cashfree connection" gate, same
   * createCashfreeAttempt for the actual Cashfree order + commission split. The only real
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
      const payment = await this.createCashfreeLinkAttempt(existingOrder.id, restaurantId, existingOrder.totalAmount, existingOrder.currency, input.customerName, input.customerPhone, connection);
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

    const payment = await this.createCashfreeLinkAttempt(order.id, restaurantId, order.totalAmount, order.currency, input.customerName, input.customerPhone, connection);
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

  /** Shared by createCashfreeAttempt and createCashfreeLinkAttempt so both Cashfree products
   *  (Orders and Payment Links) compute platform commission identically. */
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
   * The WhatsApp connector's payment-session creation — Payment Links, not Orders (see
   * CashfreeGatewayService.createPaymentLink's own comment for why). providerOrderId holds
   * Cashfree's link_id here (not an order_id): same column, same @@unique([provider,
   * providerOrderId]) index Orders-based lookups already use, so processCashfreeWebhook's
   * PAYMENT_LINK_EVENT branch can reuse the identical lookup-by-providerOrderId code path.
   * The link's own linkUrl/cfLinkId/linkStatus are kept in providerResponse (no dedicated
   * columns) and read back out by toChannelOrderResponse above.
   */
  private async createCashfreeLinkAttempt(
    orderId: string,
    restaurantId: string,
    amount: number,
    currency: string,
    customerName: string,
    customerPhone: string,
    connection: { cashfreeVendorId: string | null; commissionOverrideBps: number | null } | null
  ) {
    const { commissionBps, platformAmount, restaurantAmount } = await this.commissionSplitFor(amount, connection);
    const vendorPercentage = Number(((restaurantAmount / amount) * 100).toFixed(2));
    // Cashfree's link_id allows alphanumeric plus '-'/'_' only, max 50 chars -- a UUID (hex
    // and hyphens) is already within both constraints, no stripping/truncation needed.
    const linkId = `wapay_${randomUUID()}`;

    const payment = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({
        data: { orderId, restaurantId, providerOrderId: linkId, amount, currency, status: 'CREATED', commissionBps, platformAmount, restaurantAmount }
      })
    );

    // A stuck order is never worth chasing forever — matches QR_TTL_SECONDS's own reasoning,
    // just on a food-order timescale (minutes, not the 24h default a generic payment link gets).
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const link = await this.cashfree.createPaymentLink({
      linkId,
      amountRupees: amount / 100,
      currency,
      purpose: `Order via WhatsApp`,
      customerPhone,
      customerName,
      expiryIso: expiresAt.toISOString(),
      notifyUrl: this.config.get<string>('CASHFREE_WEBHOOK_NOTIFY_URL'),
      orderSplits: connection?.cashfreeVendorId ? [{ vendorId: connection.cashfreeVendorId, percentage: vendorPercentage }] : undefined
    });

    return this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.update({
        where: { id: payment.id },
        data: { status: 'PENDING', providerResponse: { cfLinkId: link.cfLinkId, linkUrl: link.linkUrl, linkStatus: link.linkStatus } as unknown as Prisma.InputJsonValue }
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

    const expiresAt = new Date(Date.now() + QR_TTL_SECONDS * 1000);
    const qr = await this.razorpay.createUpiQr({
      paymentRef: payment.providerOrderId,
      amountPaise: payment.amount,
      closeByUnix: Math.floor(expiresAt.getTime() / 1000),
      description: `Order ${payment.orderId.slice(0, 8)}`
    });
    if (!qr.imageUrl) throw new ServiceUnavailableException('Razorpay did not return a QR image for this payment');
    return { qrPayload: qr.imageUrl, contentType: 'image/url', expiresAt: expiresAt.toISOString(), method: 'UPI_QR' as const };
  }

  /** What the public payment page shows for one payment, read only by its unguessable id. Nothing here changes the payment. */
  async paymentPageView(paymentId: string): Promise<PaymentPageView> {
    if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return { state: 'CLOSED', message: 'This payment link is not valid.' };
    const found = await this.prisma.runAsPlatform(async (tx) => {
      const payment = await tx.paymentTransaction.findUnique({ where: { id: paymentId } });
      if (!payment) return null;
      const [restaurant, connection] = await Promise.all([
        tx.restaurant.findUnique({ where: { id: payment.restaurantId }, select: { name: true } }),
        tx.restaurantPaymentConnection.findUnique({ where: { restaurantId: payment.restaurantId }, select: { status: true } })
      ]);
      return { payment, restaurantName: restaurant?.name ?? 'the restaurant', active: connection?.status === 'ACTIVE' };
    });
    if (!found) return { state: 'CLOSED', message: 'This payment link is not valid.' };
    const { payment, restaurantName, active } = found;
    const amountLabel = `₹${(payment.amount / 100).toFixed(2)}`;
    if (PAID_STATUSES.includes(payment.status)) return { state: 'DONE', restaurantName, amountLabel };
    if (!NON_TERMINAL_STATUSES.includes(payment.status) || !payment.paymentSessionId) return { state: 'CLOSED', message: 'It has expired or was cancelled.' };
    if (!active) return { state: 'CLOSED', message: 'Online payments are paused for this restaurant.' };
    // The kiosk's QR is good for a few minutes; a page opened long after is not a guest standing at the kiosk.
    if (Date.now() - payment.createdAt.getTime() > 30 * 60 * 1000) return { state: 'CLOSED', message: 'It has expired.' };
    return { state: 'PAY', restaurantName, amountLabel, paymentSessionId: payment.paymentSessionId, mode: this.config.get<string>('CASHFREE_ENVIRONMENT') === 'production' ? 'production' : 'sandbox' };
  }

  /**
   * Called once the token and KOT exist for a paid order (by the kiosk itself, or by staff clearing a
   * stuck one). Idempotent: the first stamp wins. A SUCCESS payment that is never stamped is what the
   * "needs attention" lists are built from.
   */
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
    if (payment.provider === 'RAZORPAY' && NON_TERMINAL_STATUSES.includes(payment.status)) {
      const fromUnix = Math.floor(payment.createdAt.getTime() / 1000) - 60;
      const captured = await this.razorpay.findCapturedPaymentByRef(payment.providerOrderId, fromUnix);
      if (captured && captured.amount === payment.amount && captured.currency === payment.currency) {
        await this.settleRazorpayPayment(payment, 'SUCCESS', captured.id, captured, null, false);
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
    const { refund, providerOrderId } = await this.prisma.runAsTenant(restaurantId, async (tx) => {
      const locked = await tx.$queryRaw<{ id: string; status: string; amount: number; providerOrderId: string }[]>`
        SELECT id, status, amount, "providerOrderId" FROM "PaymentTransaction" WHERE id = ${paymentId} AND "restaurantId" = ${restaurantId} FOR UPDATE
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

      return { refund: created, providerOrderId: payment.providerOrderId };
    });

    let result;
    try {
      result = await this.cashfree.createRefund({
        orderId: providerOrderId,
        refundId: refund.id,
        amountPaise: dto.amountPaise,
        note: dto.reason
      });
    } catch (err) {
      await this.prisma.runAsTenant(restaurantId, (tx) => tx.refund.update({ where: { id: refund.id }, data: { status: 'FAILED' } }));
      throw err;
    }

    // The synchronous response is informational only — store whatever
    // Cashfree reports on the Refund row itself, but never let it flip
    // PaymentTransaction/Order to a final refunded state. Only the
    // REFUND_STATUS_WEBHOOK handler does that.
    const informationalStatus = result.refundStatus === 'SUCCESS' ? 'SUCCESS' : result.refundStatus === 'FAILED' ? 'FAILED' : 'PENDING';
    await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.refund.update({
        where: { id: refund.id },
        data: { providerRefundId: result.cfRefundId, status: informationalStatus }
      })
    );
    await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.update({ where: { id: paymentId }, data: { status: 'REFUND_PENDING' } })
    );

    return { refundId: refund.id, providerRefundId: result.cfRefundId, status: result.refundStatus, amount: dto.amountPaise };
  }

  async processCashfreeWebhook(rawBody: Buffer, signature: string | undefined, timestamp: string | undefined): Promise<void> {
    let signatureValid: boolean;
    try {
      signatureValid = Boolean(signature && timestamp && this.cashfree.verifyWebhookSignature(rawBody, timestamp, signature));
    } catch (err) {
      if (!(err instanceof ServiceUnavailableException)) throw err;
      // CASHFREE_WEBHOOK_SECRET isn't configured on this server. Every other failure branch
      // in this method durably records a WebhookEvent and returns so the controller always
      // responds 200 (per Cashfree's at-least-once delivery expectations) — this path must
      // do the same rather than propagate and surface as an unhandled 500.
      await this.prisma.runAsPlatform((tx) =>
        tx.webhookEvent.create({
          data: {
            provider: 'CASHFREE',
            providerEventKey: `UNCONFIGURED:${randomUUID()}`,
            eventType: 'UNKNOWN',
            rawPayload: this.safeParseJson(rawBody) ?? { unparsable: true },
            signatureValid: false,
            processingStatus: 'FAILED',
            errorMessage: 'Cashfree webhook secret not configured on this server'
          }
        })
      );
      return;
    }

    if (!signatureValid) {
      await this.prisma.runAsPlatform((tx) =>
        tx.webhookEvent.create({
          data: {
            provider: 'CASHFREE',
            providerEventKey: `INVALID:${randomUUID()}`,
            eventType: 'UNKNOWN',
            rawPayload: this.safeParseJson(rawBody) ?? { unparsable: true },
            signatureValid: false,
            processingStatus: 'FAILED',
            errorMessage: 'Invalid or missing webhook signature'
          }
        })
      );
      return;
    }

    // A valid signature only proves the sender holds the shared secret over these exact
    // bytes — it says nothing about whether those bytes are well-formed JSON. Reuse
    // safeParseJson (rather than a bare JSON.parse that would throw uncaught here) so a
    // malformed body is recorded as a FAILED WebhookEvent and answered with the same
    // durably-recorded 200 every other failure branch in this method uses, instead of an
    // unhandled exception surfacing as a 500.
    const parsed = this.safeParseJson(rawBody);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      await this.prisma.runAsPlatform((tx) =>
        tx.webhookEvent.create({
          data: {
            provider: 'CASHFREE',
            providerEventKey: `MALFORMED:${randomUUID()}`,
            eventType: 'UNKNOWN',
            rawPayload: { unparsable: true },
            signatureValid: true,
            processingStatus: 'FAILED',
            errorMessage: 'Malformed webhook payload JSON'
          }
        })
      );
      return;
    }
    const payload = parsed as Record<string, any>;
    const eventType: string = payload.type;
    // REFUND_STATUS_WEBHOOK nests everything under data.refund instead of
    // data.payment/data.order — both order_id and a payment-identifying id
    // are still present there, verified against Cashfree's real refund
    // webhook payload docs, so the same PaymentTransaction lookup below
    // (by providerOrderId) works unchanged for refund events too.
    // PAYMENT_LINK_EVENT (the WhatsApp connector's Cashfree product — see
    // CashfreeGatewayService.createPaymentLink) is a third, differently-shaped payload:
    // link_id/cf_link_id/link_status sit directly under `data`, not nested under
    // `data.order`/`data.payment` the way Orders' own webhook nests them. providerOrderId
    // holds the link_id for these PaymentTransaction rows (see createCashfreeLinkAttempt).
    // A PAID link event ALSO carries a nested `data.order` — but that's Cashfree's own
    // internal order id for the underlying transaction, not our link_id, and must never be
    // used for this lookup: a blind `??` fallback across all three shapes picked it first
    // (found live, not by inspection — see git history), so this event type is resolved
    // explicitly instead of falling through the Orders/refund chain.
    const cfPaymentId: string | undefined = payload.data?.payment?.cf_payment_id ?? payload.data?.refund?.cf_payment_id;
    const providerOrderId: string | undefined =
      eventType === 'PAYMENT_LINK_EVENT' ? payload.data?.link_id : (payload.data?.order?.order_id ?? payload.data?.refund?.order_id);
    const cfRefundId: string | undefined = payload.data?.refund?.cf_refund_id;
    const cfLinkId: string | undefined = payload.data?.cf_link_id;
    const linkStatus: string | undefined = payload.data?.link_status;
    // cf_refund_id/cf_link_id+link_status are the most specific identifiers available for
    // their event types — falling back to cfPaymentId/providerOrderId alone would collide
    // dedup keys across multiple refunds on the same payment, or across a link's own status
    // transitions (a link's cf_link_id never changes across its whole lifecycle, so without
    // link_status in the key a genuine PARTIALLY_PAID -> PAID transition would be wrongly
    // deduped as a repeat of the first delivery).
    const providerEventKey =
      eventType === 'PAYMENT_LINK_EVENT'
        ? `PAYMENT_LINK_EVENT:${cfLinkId ?? providerOrderId ?? randomUUID()}:${linkStatus ?? 'UNKNOWN'}`
        : `${eventType}:${cfRefundId ?? cfPaymentId ?? providerOrderId ?? randomUUID()}`;

    const existing = await this.prisma.runAsPlatform((tx) =>
      tx.webhookEvent.findUnique({ where: { provider_providerEventKey: { provider: 'CASHFREE', providerEventKey } } })
    );
    if (existing && existing.processingStatus !== 'FAILED') {
      // A prior delivery under this derived key already completed (successfully
      // processed, or deliberately skipped as irrelevant/already-terminal) — this
      // is a genuine duplicate delivery, not a retry of a failed attempt.
      await this.prisma.runAsPlatform((tx) =>
        tx.webhookEvent.update({ where: { id: existing.id }, data: { retryCount: { increment: 1 }, processingStatus: 'IGNORED_DUPLICATE' } })
      );
      return;
    }

    // Either no WebhookEvent exists yet for this key, or the only one we have
    // FAILED (e.g. an earlier delivery under the same cf_payment_id carried a bad
    // or missing amount). The (provider, providerEventKey) unique constraint means
    // a failed row can't simply be superseded by a new one, so it is reused here —
    // otherwise a corrected/legitimate retry would be silently swallowed forever as
    // an "IGNORED_DUPLICATE" of its own earlier failure, permanently blocking a real
    // payment from ever reaching SUCCESS.
    const webhookEvent = existing
      ? await this.prisma.runAsPlatform((tx) =>
          tx.webhookEvent.update({
            where: { id: existing.id },
            data: { rawPayload: payload, signatureValid: true, processingStatus: 'VERIFIED', errorMessage: null, retryCount: { increment: 1 } }
          })
        )
      : await this.prisma.runAsPlatform((tx) =>
          tx.webhookEvent.create({
            data: { provider: 'CASHFREE', providerEventKey, eventType, rawPayload: payload, signatureValid: true, processingStatus: 'VERIFIED' }
          })
        );

    if (!providerOrderId) {
      await this.markWebhookFailed(webhookEvent.id, 'Missing order_id in webhook payload');
      return;
    }

    const payment = await this.prisma.runAsPlatform((tx) =>
      tx.paymentTransaction.findUnique({ where: { provider_providerOrderId: { provider: 'CASHFREE', providerOrderId } }, include: { order: true } })
    );
    if (!payment) {
      await this.markWebhookFailed(webhookEvent.id, `No PaymentTransaction found for providerOrderId ${providerOrderId}`);
      return;
    }

    await this.prisma.runAsPlatform((tx) => tx.webhookEvent.update({ where: { id: webhookEvent.id }, data: { restaurantId: payment.restaurantId } }));

    if (eventType === 'REFUND_STATUS_WEBHOOK') {
      await this.handleRefundWebhook(payment, payload, webhookEvent.id);
      return;
    }

    if (eventType === 'PAYMENT_LINK_EVENT') {
      await this.handlePaymentLinkWebhook(payment, payload, webhookEvent.id);
      return;
    }

    const RELEVANT_TYPES = ['PAYMENT_SUCCESS_WEBHOOK', 'PAYMENT_FAILED_WEBHOOK', 'PAYMENT_USER_DROPPED_WEBHOOK'];
    if (!RELEVANT_TYPES.includes(eventType)) {
      await this.markWebhookProcessed(webhookEvent.id);
      return;
    }

    const orderAmountRupees = payload.data?.order?.order_amount;
    const orderCurrency = payload.data?.order?.order_currency;
    const receivedAmountPaise = typeof orderAmountRupees === 'number' ? Math.round(orderAmountRupees * 100) : null;

    if (receivedAmountPaise === null || receivedAmountPaise !== payment.amount || orderCurrency !== payment.currency) {
      await this.markWebhookFailed(webhookEvent.id, `Amount/currency mismatch: expected ${payment.amount} ${payment.currency}, got ${receivedAmountPaise} ${orderCurrency}`);
      return;
    }

    const TERMINAL_STATUSES = ['SUCCESS', 'REFUNDED', 'PARTIALLY_REFUNDED'];
    if (TERMINAL_STATUSES.includes(payment.status)) {
      // Already settled by an earlier delivery. For a WhatsApp order this is also the retry
      // path if that earlier delivery's KDS ingestion itself failed (see the catch below) —
      // ingestWhatsAppOrderIfNeeded is safe to call again: ingestServerOrder dedupes on
      // (restaurantId, externalOrderId), so a redelivery after a successful ingestion is a no-op.
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

    const newStatus = eventType === 'PAYMENT_SUCCESS_WEBHOOK' ? 'SUCCESS' : eventType === 'PAYMENT_USER_DROPPED_WEBHOOK' ? 'USER_DROPPED' : 'FAILED';

    await this.prisma.runAsTenant(payment.restaurantId, async (tx) => {
      await tx.paymentTransaction.update({
        where: { id: payment.id },
        data: {
          status: newStatus,
          providerPaymentId: cfPaymentId,
          providerResponse: payload as unknown as Prisma.InputJsonValue,
          failureReason: newStatus === 'SUCCESS' ? null : (payload.data?.payment?.payment_message ?? null),
          paidAt: newStatus === 'SUCCESS' ? new Date() : null
        }
      });
      await tx.order.update({ where: { id: payment.orderId }, data: { status: newStatus === 'SUCCESS' ? 'PAID' : 'PAYMENT_FAILED' } });
      await tx.restaurantPaymentConnection.updateMany({
        where: { restaurantId: payment.restaurantId },
        data: { lastWebhookAt: new Date(), ...(newStatus === 'SUCCESS' ? { lastPaymentAt: new Date() } : {}) }
      });
    });

    // Money is already recorded as settled above regardless of what happens next — this is a
    // second, independent effect (make the order visible on POS/KDS), not part of that
    // transaction, and its failure must never be reported back to Cashfree as a payment failure.
    if (newStatus === 'SUCCESS') {
      const err = await this.ingestWhatsAppOrderIfNeeded(payment);
      if (err) {
        await this.markWebhookFailed(webhookEvent.id, err);
        return;
      }
    }

    await this.markWebhookProcessed(webhookEvent.id);
  }

  async processRazorpayWebhook(rawBody: Buffer, signature: string | undefined): Promise<void> {
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
    const entity = payload.payload?.payment?.entity;
    const paymentRef: string | undefined = entity?.notes?.payment_ref ?? payload.payload?.qr_code?.entity?.notes?.payment_ref;
    const razorpayPaymentId: string | undefined = entity?.id;
    const providerEventKey = `${eventType}:${razorpayPaymentId ?? randomUUID()}`;

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
      await this.markWebhookFailed(webhookEvent.id, 'Missing payment_ref in webhook notes');
      return;
    }

    const payment = await this.prisma.runAsPlatform((tx) =>
      tx.paymentTransaction.findUnique({ where: { provider_providerOrderId: { provider: 'RAZORPAY', providerOrderId: paymentRef } }, include: { order: true } })
    );
    if (!payment) {
      await this.markWebhookFailed(webhookEvent.id, `No PaymentTransaction found for payment_ref ${paymentRef}`);
      return;
    }
    await this.prisma.runAsPlatform((tx) => tx.webhookEvent.update({ where: { id: webhookEvent.id }, data: { restaurantId: payment.restaurantId } }));

    if (entity?.amount !== payment.amount || entity?.currency !== payment.currency) {
      await this.markWebhookFailed(webhookEvent.id, `Amount/currency mismatch: expected ${payment.amount} ${payment.currency}, got ${entity?.amount} ${entity?.currency}`);
      return;
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

    const err = await this.settleRazorpayPayment(payment, newStatus, razorpayPaymentId, payload, entity?.error_description ?? null, true);
    if (err) {
      await this.markWebhookFailed(webhookEvent.id, err);
      return;
    }
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
   * place that call happens, reached only from a payment already confirmed SUCCESS by Cashfree
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
        paymentMethod: 'CASHFREE',
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

  private async handleRefundWebhook(
    payment: { id: string; orderId: string; restaurantId: string; amount: number },
    payload: Record<string, any>,
    webhookEventId: string
  ): Promise<void> {
    const refundData = payload.data?.refund;
    const cfRefundId: string | undefined = refundData?.cf_refund_id;
    const refundStatus: string | undefined = refundData?.refund_status;
    const refundAmountRupees = refundData?.refund_amount;
    const receivedRefundAmountPaise = typeof refundAmountRupees === 'number' ? Math.round(refundAmountRupees * 100) : null;

    if (!cfRefundId || receivedRefundAmountPaise === null) {
      await this.markWebhookFailed(webhookEventId, 'Missing refund id or amount in REFUND_STATUS_WEBHOOK payload');
      return;
    }

    const refund = await this.prisma.runAsPlatform((tx) => tx.refund.findFirst({ where: { paymentId: payment.id, providerRefundId: cfRefundId } }));
    if (!refund) {
      await this.markWebhookFailed(webhookEventId, `No Refund found for cf_refund_id ${cfRefundId}`);
      return;
    }

    if (receivedRefundAmountPaise !== refund.amount) {
      await this.markWebhookFailed(webhookEventId, `Refund amount mismatch: expected ${refund.amount}, got ${receivedRefundAmountPaise}`);
      return;
    }

    if (refund.status === 'SUCCESS' || refund.status === 'FAILED') {
      // Already terminal — a resent webhook for an already-processed refund.
      await this.markWebhookProcessed(webhookEventId);
      return;
    }

    const newRefundStatus = refundStatus === 'SUCCESS' ? 'SUCCESS' : refundStatus === 'FAILED' || refundStatus === 'CANCELLED' ? 'FAILED' : null;
    if (!newRefundStatus) {
      // Still processing at Cashfree's end — nothing final to record yet.
      await this.markWebhookProcessed(webhookEventId);
      return;
    }

    await this.prisma.runAsTenant(payment.restaurantId, async (tx) => {
      await tx.refund.update({ where: { id: refund.id }, data: { status: newRefundStatus, processedAt: new Date() } });

      if (newRefundStatus === 'SUCCESS') {
        const totalRefunded = await tx.refund.aggregate({
          where: { paymentId: payment.id, status: 'SUCCESS' },
          _sum: { amount: true }
        });
        const refundedSoFar = totalRefunded._sum.amount ?? 0;
        const isFullyRefunded = refundedSoFar >= payment.amount;
        const finalStatus = isFullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

        await tx.paymentTransaction.update({ where: { id: payment.id }, data: { status: finalStatus } });
        await tx.order.update({ where: { id: payment.orderId }, data: { status: finalStatus } });
      }
      // FAILED: leave PaymentTransaction/Order status untouched — the money never left.
    });

    await this.markWebhookProcessed(webhookEventId);
  }

  /**
   * PAYMENT_LINK_EVENT — the WhatsApp connector's own Cashfree product (Payment Links, not
   * Orders; see CashfreeGatewayService.createPaymentLink). Deliberately a separate method
   * from the Orders-based SUCCESS/FAILED handling above rather than a shared one: the two
   * payloads nest their fields completely differently (data.link_status/data.order.
   * transaction_id here vs data.order.order_amount/data.payment.cf_payment_id there), and
   * forcing one generic parser to cover both shapes would be harder to read than two
   * parallel ones — the same reasoning handleRefundWebhook already exists as its own method
   * alongside the main flow, not folded into it.
   */
  private async handlePaymentLinkWebhook(
    payment: {
      id: string;
      restaurantId: string;
      orderId: string;
      amount: number;
      currency: string;
      status: string;
      order: Parameters<PaymentsService['ingestWhatsAppOrderIfNeeded']>[0]['order'];
    },
    payload: Record<string, any>,
    webhookEventId: string
  ): Promise<void> {
    const linkAmountRupees = payload.data?.link_amount;
    const linkCurrency = payload.data?.link_currency;
    const receivedAmountPaise = typeof linkAmountRupees === 'number' ? Math.round(linkAmountRupees * 100) : null;

    if (receivedAmountPaise === null || receivedAmountPaise !== payment.amount || linkCurrency !== payment.currency) {
      await this.markWebhookFailed(webhookEventId, `Amount/currency mismatch: expected ${payment.amount} ${payment.currency}, got ${receivedAmountPaise} ${linkCurrency}`);
      return;
    }

    const TERMINAL_STATUSES = ['SUCCESS', 'REFUNDED', 'PARTIALLY_REFUNDED'];
    if (TERMINAL_STATUSES.includes(payment.status)) {
      // Same retry reasoning as the Orders-based branch above: a redelivery (or a later
      // status webhook for a link that's already SUCCESS) still gets one more chance at
      // KDS ingestion if an earlier delivery's ingestion itself failed.
      if (payment.status === 'SUCCESS') {
        const err = await this.ingestWhatsAppOrderIfNeeded(payment);
        if (err) {
          await this.markWebhookFailed(webhookEventId, err);
          return;
        }
      }
      await this.markWebhookProcessed(webhookEventId);
      return;
    }

    const linkStatus: string | undefined = payload.data?.link_status;
    const newStatus = linkStatus === 'PAID' ? 'SUCCESS' : linkStatus === 'EXPIRED' || linkStatus === 'CANCELLED' ? 'FAILED' : null;
    if (!newStatus) {
      // PARTIALLY_PAID (partial payments aren't enabled on links this connector creates,
      // but handled defensively) — not a terminal outcome yet, nothing to finalize.
      await this.markWebhookProcessed(webhookEventId);
      return;
    }

    const cfTransactionId: string | undefined = payload.data?.order?.transaction_id;

    await this.prisma.runAsTenant(payment.restaurantId, async (tx) => {
      await tx.paymentTransaction.update({
        where: { id: payment.id },
        data: {
          status: newStatus,
          providerPaymentId: cfTransactionId,
          providerResponse: payload as unknown as Prisma.InputJsonValue,
          paidAt: newStatus === 'SUCCESS' ? new Date() : null
        }
      });
      await tx.order.update({ where: { id: payment.orderId }, data: { status: newStatus === 'SUCCESS' ? 'PAID' : 'PAYMENT_FAILED' } });
      await tx.restaurantPaymentConnection.updateMany({
        where: { restaurantId: payment.restaurantId },
        data: { lastWebhookAt: new Date(), ...(newStatus === 'SUCCESS' ? { lastPaymentAt: new Date() } : {}) }
      });
    });

    if (newStatus === 'SUCCESS') {
      const err = await this.ingestWhatsAppOrderIfNeeded(payment);
      if (err) {
        await this.markWebhookFailed(webhookEventId, err);
        return;
      }
    }

    await this.markWebhookProcessed(webhookEventId);
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
