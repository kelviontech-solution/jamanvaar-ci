import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentTransactionStatus, PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { requireStepUpPassword } from '../../common/security/step-up.util';
import { RAZORPAY_FEE_BPS, MIN_COMMISSION_BPS, PAYMENT_DEFAULT_COMMISSION_BPS_KEY, getDefaultCommissionBps } from './commission.util';
import { buildDayStatement } from './payment-statement.util';
import { ATTENTION_GRACE_MS, PaymentsService } from './payments.service';

export interface PlatformPaymentFilters {
  restaurantId?: string;
  status?: PaymentTransactionStatus;
  page: number;
  limit: number;
}

@Injectable()
export class PlatformPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly payments: PaymentsService
  ) {}

  async list(filters: PlatformPaymentFilters) {
    return this.prisma.runAsPlatform(async (tx) => {
      const where = {
        ...(filters.restaurantId ? { restaurantId: filters.restaurantId } : {}),
        ...(filters.status ? { status: filters.status } : {})
      };
      const [rows, total] = await Promise.all([
        tx.paymentTransaction.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (filters.page - 1) * filters.limit,
          take: filters.limit,
          include: {
            order: {
              select: { id: true, externalOrderId: true, subtotal: true, taxAmount: true, discountAmount: true, totalAmount: true, status: true }
            },
            refunds: {
              select: { id: true, amount: true, status: true, reason: true, createdAt: true, processedAt: true }
            }
          }
        }),
        tx.paymentTransaction.count({ where })
      ]);
      return { rows, total, page: filters.page, limit: filters.limit };
    });
  }

  async getById(paymentId: string) {
    const payment = await this.prisma.runAsPlatform((tx) =>
      tx.paymentTransaction.findUnique({
        where: { id: paymentId },
        include: {
          order: true,
          refunds: { orderBy: { createdAt: 'desc' } }
        }
      })
    );
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  async getCommissionConfig() {
    return { defaultBps: await getDefaultCommissionBps(this.prisma) };
  }

  async setDefaultCommissionBps(bps: number, actor: PlatformUser, password?: string) {
    if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
      throw new BadRequestException('defaultBps must be an integer between 0 and 10000');
    }
    await requireStepUpPassword(actor, password);
    if (bps < MIN_COMMISSION_BPS) throw new BadRequestException("The commission must be at least 2%, because Razorpay's 2% fee is paid out of it.");
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.platformSetting.findUnique({ where: { key: PAYMENT_DEFAULT_COMMISSION_BPS_KEY } });
      const oldBps = (existing?.value as { bps?: number } | undefined)?.bps ?? 0;
      await tx.platformSetting.upsert({
        where: { key: PAYMENT_DEFAULT_COMMISSION_BPS_KEY },
        create: { key: PAYMENT_DEFAULT_COMMISSION_BPS_KEY, value: { bps }, category: 'PAYMENTS', updatedBy: actor.id },
        update: { value: { bps }, updatedBy: actor.id }
      });
      await this.audit.log(
        { actorType: 'PLATFORM', actorId: actor.id, action: 'COMMISSION_CHANGED', category: 'PAYMENTS', details: { scope: 'PLATFORM_DEFAULT', oldBps, newBps: bps } },
        tx
      );
      return { defaultBps: bps };
    });
  }

  async platformSummary(filters: { restaurantId?: string; status?: PaymentTransactionStatus; from?: Date; to?: Date }) {
    return this.prisma.runAsPlatform(async (tx) => {
      const where = {
        ...(filters.restaurantId ? { restaurantId: filters.restaurantId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.from || filters.to ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } } : {})
      };
      const [successAgg, refundAgg, statusCounts] = await Promise.all([
        tx.paymentTransaction.aggregate({
          where: { ...where, status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
          _sum: { amount: true, platformAmount: true, restaurantAmount: true },
          _count: true
        }),
        tx.refund.aggregate({ where: { status: 'SUCCESS', payment: where }, _sum: { amount: true } }),
        tx.paymentTransaction.groupBy({ by: ['status'], where, _count: true })
      ]);
      return {
        grossVolume: successAgg._sum.amount ?? 0,
        platformCommission: successAgg._sum.platformAmount ?? 0,
        razorpayFee: Math.round(((successAgg._sum.amount ?? 0) * RAZORPAY_FEE_BPS) / 10000),
        platformNetCommission: (successAgg._sum.platformAmount ?? 0) - Math.round(((successAgg._sum.amount ?? 0) * RAZORPAY_FEE_BPS) / 10000),
        restaurantShare: successAgg._sum.restaurantAmount ?? 0,
        refundedAmount: refundAgg._sum.amount ?? 0,
        successfulCount: successAgg._count,
        statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count]))
      };
    });
  }

  /** Paid orders whose kiosk never confirmed the token/KOT (crash, offline, or a payment that landed after the QR expired). */
  async attention() {
    const cutoff = new Date(Date.now() - ATTENTION_GRACE_MS);
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.runAsPlatform((tx) =>
      tx.paymentTransaction.findMany({
        where: { status: 'SUCCESS', fulfilledAt: null, paidAt: { lt: cutoff }, createdAt: { gte: since } },
        orderBy: { paidAt: 'asc' },
        take: 200,
        include: { restaurant: { select: { id: true, name: true } }, order: { select: { externalOrderId: true } } }
      })
    );
    const now = Date.now();
    return {
      rows: rows.map((p) => ({
        id: p.id,
        restaurant: p.restaurant,
        externalOrderId: p.order.externalOrderId,
        amount: p.amount,
        paidAt: p.paidAt,
        minutesWaiting: Math.floor((now - (p.paidAt ?? p.createdAt).getTime()) / 60_000)
      }))
    };
  }

  async statement(restaurantId: string | undefined, date: string | undefined) {
    if (!restaurantId) throw new BadRequestException('restaurantId is required');
    return this.prisma.runAsPlatform((tx) => buildDayStatement(tx, restaurantId, date));
  }

  /** A Super Admin refund: same server-side rules as any refund (remaining balance, one Razorpay call), plus the admin's password. */
  async adminRefund(paymentId: string, dto: { amountPaise: number; reason: string }, actor: PlatformUser, password?: string) {
    await requireStepUpPassword(actor, password);
    const payment = await this.prisma.runAsPlatform((tx) => tx.paymentTransaction.findUnique({ where: { id: paymentId }, select: { restaurantId: true } }));
    if (!payment) throw new NotFoundException('Payment not found');
    return this.payments.createRefund(
      payment.restaurantId,
      paymentId,
      { amountPaise: dto.amountPaise, reason: dto.reason, requestedBy: actor.email },
      { id: actor.id, type: 'PLATFORM' },
      'PLATFORM'
    );
  }

  async adminMarkFulfilled(paymentId: string, actor: PlatformUser) {
    const payment = await this.prisma.runAsPlatform((tx) => tx.paymentTransaction.findUnique({ where: { id: paymentId }, select: { restaurantId: true } }));
    if (!payment) throw new NotFoundException('Payment not found');
    return this.payments.markFulfilled(payment.restaurantId, paymentId, { id: `platform:${actor.id}`, type: 'PLATFORM' });
  }
}
