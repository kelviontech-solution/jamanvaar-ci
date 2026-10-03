import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PaymentTransactionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CashfreeGatewayService } from './cashfree-gateway.service';

const LOOKBACK_DAYS = 7;
const RECONCILABLE_STATUSES: PaymentTransactionStatus[] = ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'];
const KNOWN_GOOD_STATUSES = ['SETTLED', 'PENDING', 'PROCESSING'];
// A link that was ever actually paid reports this exact status, regardless of a later
// refund -- Cashfree's Payment Links product has no separate "refunded" link_status of
// its own; a refund is issued against the underlying payment, not the link.
const KNOWN_GOOD_LINK_STATUS = 'PAID';
// Cashfree's Payment Links amount is submitted/returned in rupees (createPaymentLink's
// own amountRupees), while PaymentTransaction.amount is paise -- converting rupees back to
// paise can legitimately be off by a paisa from float rounding on either side. One rupee
// of tolerance absorbs that without masking a real, meaningfully wrong amount.
const AMOUNT_TOLERANCE_PAISE = 100;

@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cashfree: CashfreeGatewayService
  ) {}

  async reconcile(): Promise<{ checked: number; exceptionsCreated: number }> {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const payments = await this.prisma.runAsPlatform((tx) =>
      tx.paymentTransaction.findMany({
        where: { status: { in: RECONCILABLE_STATUSES }, createdAt: { gte: since }, commissionBps: { not: null } },
        include: { reconciliationExceptions: { where: { status: 'OPEN' } }, order: { select: { source: true } } }
      })
    );

    let exceptionsCreated = 0;
    for (const payment of payments) {
      try {
        // Phase 8 of the Jamanvaar connector (docs/integrations/
        // JAMANVAAR_WHATSAPP_CONNECTOR_IMPLEMENTATION_PLAN.md) -- a WHATSAPP-sourced
        // payment's providerOrderId is a Cashfree Payment Link id (createCashfreeLinkAttempt),
        // not a real Cashfree order id. getOrderSplitDetails below calls Cashfree's
        // /easy-split/orders/{id}/split endpoint, which is Orders-API-specific and does not
        // recognise a link id at all -- calling it for a WhatsApp payment would just throw
        // and be silently swallowed by the catch below, meaning WhatsApp orders were never
        // actually reconciled by this job. Found by reading what createCashfreeLinkAttempt
        // actually stores in providerOrderId, not assumed from the plan's "applies to
        // WhatsApp-sourced orders too" wording alone.
        if (payment.order?.source === 'WHATSAPP') {
          exceptionsCreated += await this.reconcileLinkPayment(payment);
          continue;
        }

        const connection = await this.prisma.runAsPlatform((tx) =>
          tx.restaurantPaymentConnection.findUnique({ where: { restaurantId: payment.restaurantId } })
        );
        const { splits } = await this.cashfree.getOrderSplitDetails(payment.providerOrderId);
        const match = connection?.cashfreeVendorId ? splits.find((s) => s.vendorId === connection.cashfreeVendorId) : undefined;

        if (!match) {
          if (!payment.reconciliationExceptions.some((e) => e.type === 'MISSING_AT_CASHFREE')) {
            await this.createException(payment.id, payment.restaurantId, 'MISSING_AT_CASHFREE', {
              expectedVendorId: connection?.cashfreeVendorId ?? null,
              actualSplits: splits
            });
            exceptionsCreated++;
          }
          continue;
        }

        if (!KNOWN_GOOD_STATUSES.includes(match.status)) {
          if (!payment.reconciliationExceptions.some((e) => e.type === 'UNEXPECTED_STATUS')) {
            await this.createException(payment.id, payment.restaurantId, 'UNEXPECTED_STATUS', { cashfreeStatus: match.status });
            exceptionsCreated++;
          }
        }
      } catch (err) {
        this.logger.error(`Reconciliation failed for payment ${payment.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { checked: payments.length, exceptionsCreated };
  }

  /**
   * Payment-Link-specific reconciliation (see the comment at its one call site above).
   * Narrower than the Orders-API check: Cashfree's Payment Link detail response doesn't
   * expose a parsed per-vendor split-settlement status the way /easy-split/orders/{id}/split
   * does, so this only confirms the link itself actually reached PAID and for the right
   * amount -- the vendor-split settlement side of a WhatsApp order is not yet independently
   * verified here. Returns the number of new exceptions created (0 or 1).
   */
  private async reconcileLinkPayment(payment: {
    id: string;
    restaurantId: string;
    providerOrderId: string;
    amount: number;
    reconciliationExceptions: { type: string }[];
  }): Promise<number> {
    const { linkStatus, amountPaid } = await this.cashfree.getPaymentLinkDetails(payment.providerOrderId);

    if (linkStatus !== KNOWN_GOOD_LINK_STATUS) {
      if (!payment.reconciliationExceptions.some((e) => e.type === 'UNEXPECTED_STATUS')) {
        await this.createException(payment.id, payment.restaurantId, 'UNEXPECTED_STATUS', { cashfreeLinkStatus: linkStatus });
        return 1;
      }
      return 0;
    }

    const amountPaidPaise = Math.round(amountPaid * 100);
    if (Math.abs(amountPaidPaise - payment.amount) > AMOUNT_TOLERANCE_PAISE) {
      if (!payment.reconciliationExceptions.some((e) => e.type === 'AMOUNT_MISMATCH')) {
        await this.createException(payment.id, payment.restaurantId, 'AMOUNT_MISMATCH', { expectedPaise: payment.amount, cashfreeAmountPaidPaise: amountPaidPaise });
        return 1;
      }
    }
    return 0;
  }

  private async createException(
    paymentId: string,
    restaurantId: string,
    type: 'MISSING_AT_CASHFREE' | 'UNEXPECTED_STATUS' | 'AMOUNT_MISMATCH' | 'SPLIT_MISMATCH',
    details: Record<string, unknown>
  ) {
    await this.prisma.runAsPlatform((tx) =>
      tx.reconciliationException.create({ data: { paymentId, restaurantId, type, details: details as Prisma.InputJsonValue, status: 'OPEN' } })
    );
  }
}
