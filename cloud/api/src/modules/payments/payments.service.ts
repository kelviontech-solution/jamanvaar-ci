import { randomUUID } from 'crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CashfreeGatewayService } from './cashfree-gateway.service';
import { MenuSyncService } from './menu-sync.service';
import { priceCart, PriceValidationError, MenuSnapshotItemLookup } from './pricing.util';
import { CreatePaymentOrderDto } from './dto/create-payment-order.dto';

const NON_TERMINAL_STATUSES = ['CREATED', 'PENDING', 'AUTHORIZED'];

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cashfree: CashfreeGatewayService,
    private readonly menuSync: MenuSyncService
  ) {}

  async createOrGetPaymentOrder(restaurantId: string, kioskId: string, dto: CreatePaymentOrderDto) {
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
      const payment = await this.createCashfreeAttempt(existingOrder.id, restaurantId, existingOrder.totalAmount, existingOrder.currency);
      return this.toOrderResponse(existingOrder, payment);
    }

    const connection = await this.prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.findUnique({ where: { restaurantId } }));
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

    const payment = await this.createCashfreeAttempt(order.id, restaurantId, order.totalAmount, order.currency);
    return this.toOrderResponse(order, payment);
  }

  private async createCashfreeAttempt(orderId: string, restaurantId: string, amount: number, currency: string) {
    const payment = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({
        data: { orderId, restaurantId, providerOrderId: `pay_${randomUUID()}`, amount, currency, status: 'CREATED' }
      })
    );

    const cfOrder = await this.cashfree.createOrder({
      orderId: payment.providerOrderId,
      amountPaise: amount,
      currency,
      customerId: orderId,
      notifyUrl: this.config.get<string>('CASHFREE_WEBHOOK_NOTIFY_URL')
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

  async getPaymentStatus(restaurantId: string, paymentId: string) {
    const payment = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.findFirst({ where: { id: paymentId, restaurantId }, include: { order: true } })
    );
    if (!payment) throw new NotFoundException('Payment not found');
    return { paymentId: payment.id, orderId: payment.orderId, status: payment.status, amount: payment.amount, currency: payment.currency, orderStatus: payment.order.status };
  }

  async processCashfreeWebhook(rawBody: Buffer, signature: string | undefined, timestamp: string | undefined): Promise<void> {
    const signatureValid = Boolean(signature && timestamp && this.cashfree.verifyWebhookSignature(rawBody, timestamp, signature));

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
    const cfPaymentId: string | undefined = payload.data?.payment?.cf_payment_id;
    const providerOrderId: string | undefined = payload.data?.order?.order_id;
    const providerEventKey = `${eventType}:${cfPaymentId ?? providerOrderId ?? randomUUID()}`;

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
