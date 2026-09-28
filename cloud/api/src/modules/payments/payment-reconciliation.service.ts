import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CashfreeGatewayService } from './cashfree-gateway.service';

const LOOKBACK_DAYS = 7;
const RECONCILABLE_STATUSES = ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;
const KNOWN_GOOD_STATUSES = ['SETTLED', 'PENDING', 'PROCESSING'];

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
        where: { status: { in: RECONCILABLE_STATUSES as unknown as string[] }, createdAt: { gte: since }, commissionBps: { not: null } },
        include: { reconciliationExceptions: { where: { status: 'OPEN' } } }
      })
    );

    let exceptionsCreated = 0;
    for (const payment of payments) {
      try {
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

  private async createException(
    paymentId: string,
    restaurantId: string,
    type: 'MISSING_AT_CASHFREE' | 'UNEXPECTED_STATUS' | 'AMOUNT_MISMATCH' | 'SPLIT_MISMATCH',
    details: Record<string, unknown>
  ) {
    await this.prisma.runAsPlatform((tx) =>
      tx.reconciliationException.create({ data: { paymentId, restaurantId, type, details, status: 'OPEN' } })
    );
  }
}
