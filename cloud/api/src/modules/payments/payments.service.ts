import { randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CashfreeFeatureNotEnabledException, CashfreeGatewayService } from './cashfree-gateway.service';
import type { PaymentPageView } from './payment-page.util';
import { MenuSyncService } from './menu-sync.service';
import { priceCart, PriceValidationError, MenuSnapshotItemLookup } from './pricing.util';
import { CreatePaymentOrderDto } from './dto/create-payment-order.dto';
import { CreateRefundDto } from './dto/create-refund.dto';
import { getDefaultCommissionBps } from './commission.util';
import { buildDayStatement } from './payment-statement.util';

const NON_TERMINAL_STATUSES = ['CREATED', 'PENDING', 'AUTHORIZED'];
const PAID_STATUSES = ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REFUND_PENDING'];
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
    private readonly menuSync: MenuSyncService,
    private readonly audit: AuditService
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
      const payment = await this.createCashfreeAttempt(existingOrder.id, restaurantId, existingOrder.totalAmount, existingOrder.currency, connection);
      return this.toOrderResponse(existingOrder, payment);
    }

    if (!connection || connection.status !== 'ACTIVE') {
      throw new ForbiddenException('Online payments are not active for this restaurant yet');
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

    const payment = await this.createCashfreeAttempt(order.id, restaurantId, order.totalAmount, order.currency, connection);
    return this.toOrderResponse(order, payment);
  }

  private async createCashfreeAttempt(
    orderId: string,
    restaurantId: string,
    amount: number,
    currency: string,
    connection: { cashfreeVendorId: string | null; commissionOverrideBps: number | null } | null
  ) {
    const commissionBps = connection?.commissionOverrideBps ?? (await getDefaultCommissionBps(this.prisma));
    const platformAmount = Math.round((amount * commissionBps) / 10000);
    const restaurantAmount = amount - platformAmount;
    const vendorPercentage = Number(((restaurantAmount / amount) * 100).toFixed(2));

    const payment = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({
        data: { orderId, restaurantId, providerOrderId: `pay_${randomUUID()}`, amount, currency, status: 'CREATED', commissionBps, platformAmount, restaurantAmount }
      })
    );

    const cfOrder = await this.cashfree.createOrder({
      orderId: payment.providerOrderId,
      amountPaise: amount,
      currency,
      customerId: orderId,
      notifyUrl: this.config.get<string>('CASHFREE_WEBHOOK_NOTIFY_URL'),
      orderSplits: connection?.cashfreeVendorId ? [{ vendorId: connection.cashfreeVendorId, percentage: vendorPercentage }] : undefined
    });

    return this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.update({ where: { id: payment.id }, data: { paymentSessionId: cfOrder.paymentSessionId, status: 'PENDING' } })
    );
  }

  private toOrderResponse(
    order: { id: string; totalAmount: number; currency: string },
    payment: { id: string; paymentSessionId: string | null; status: string }
  ) {
    return { orderId: order.id, paymentId: payment.id, paymentSessionId: payment.paymentSessionId, amount: order.totalAmount, currency: order.currency, status: payment.status };
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
   * A UPI QR for one pending payment, rendered by the kiosk itself. The QR is only ever created for a
   * payment that is still open and only while the restaurant's Cashfree connection is ACTIVE, so a
   * suspended restaurant stops taking new payments immediately.
   */
  async createUpiQr(restaurantId: string, paymentId: string) {
    const payment = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.findFirst({ where: { id: paymentId, restaurantId } })
    );
    if (!payment) throw new NotFoundException('Payment not found');
    if (!NON_TERMINAL_STATUSES.includes(payment.status)) {
      throw new BadRequestException(`Cannot create a QR for a payment in status ${payment.status}`);
    }
    if (!payment.paymentSessionId) {
      throw new ServiceUnavailableException('This payment has no Cashfree session yet');
    }
    const connection = await this.prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } }));
    if (!connection || connection.status !== 'ACTIVE') {
      throw new ForbiddenException('Online payments are not active for this restaurant');
    }

    const expiresAt = new Date(Date.now() + QR_TTL_SECONDS * 1000);
    try {
      const qr = await this.cashfree.createUpiQr(payment.paymentSessionId, expiresAt.toISOString());
      return { qrPayload: qr.qrPayload, contentType: qr.contentType, expiresAt: expiresAt.toISOString(), method: 'UPI_QR' as const };
    } catch (err) {
      // The account has not been approved for Cashfree's server-to-server UPI QR. The QR then carries the address of our payment page,
      // which opens Cashfree's own checkout (approved on every account). The guest scans it with the phone camera and picks a UPI app.
      const base = this.paymentPageBaseUrl();
      if (!(err instanceof CashfreeFeatureNotEnabledException) || !base) throw err;
      return { qrPayload: `${base}/api/v1/pay/${payment.id}`, contentType: 'text/uri-list', expiresAt: expiresAt.toISOString(), method: 'CHECKOUT_PAGE' as const };
    }
  }

  /** The public address guests' phones can reach: PAYMENT_PAGE_BASE_URL, or the address Cashfree is told to call back (its origin). */
  private paymentPageBaseUrl(): string | null {
    const explicit = this.config.get<string>('PAYMENT_PAGE_BASE_URL')?.trim();
    if (explicit) return explicit.replace(/\/+$/, '');
    const notify = this.config.get<string>('CASHFREE_WEBHOOK_NOTIFY_URL')?.trim();
    if (!notify) return null;
    try {
      return new URL(notify).origin;
    } catch {
      return null;
    }
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
    const payment = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.findFirst({ where: { id: paymentId, restaurantId }, include: { order: true } })
    );
    if (!payment) throw new NotFoundException('Payment not found');
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
    const cfPaymentId: string | undefined = payload.data?.payment?.cf_payment_id ?? payload.data?.refund?.cf_payment_id;
    const providerOrderId: string | undefined = payload.data?.order?.order_id ?? payload.data?.refund?.order_id;
    const cfRefundId: string | undefined = payload.data?.refund?.cf_refund_id;
    // cf_refund_id is the most specific identifier available for a refund
    // event — falling back to cfPaymentId/providerOrderId would collide
    // dedup keys across multiple refunds on the same payment.
    const providerEventKey = `${eventType}:${cfRefundId ?? cfPaymentId ?? providerOrderId ?? randomUUID()}`;

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
      tx.paymentTransaction.findUnique({ where: { provider_providerOrderId: { provider: 'CASHFREE', providerOrderId } } })
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

    await this.markWebhookProcessed(webhookEvent.id);
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
