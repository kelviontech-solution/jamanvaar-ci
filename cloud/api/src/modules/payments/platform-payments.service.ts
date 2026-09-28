import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentTransactionStatus, PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { requireStepUpPassword } from '../../common/security/step-up.util';
import { PAYMENT_DEFAULT_COMMISSION_BPS_KEY, getDefaultCommissionBps } from './commission.util';

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
    private readonly audit: AuditService
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
      const [successAgg, refundAgg, statusCounts, exceptionCount] = await Promise.all([
        tx.paymentTransaction.aggregate({
          where: { ...where, status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
          _sum: { amount: true, platformAmount: true, restaurantAmount: true },
          _count: true
        }),
        tx.refund.aggregate({ where: { status: 'SUCCESS', payment: where }, _sum: { amount: true } }),
        tx.paymentTransaction.groupBy({ by: ['status'], where, _count: true }),
        tx.reconciliationException.count({ where: { status: 'OPEN', ...(filters.restaurantId ? { restaurantId: filters.restaurantId } : {}) } })
      ]);
      return {
        grossVolume: successAgg._sum.amount ?? 0,
        platformCommission: successAgg._sum.platformAmount ?? 0,
        restaurantShare: successAgg._sum.restaurantAmount ?? 0,
        refundedAmount: refundAgg._sum.amount ?? 0,
        successfulCount: successAgg._count,
        statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
        openReconciliationExceptions: exceptionCount
      };
    });
  }

  async listReconciliationExceptions(filters: { restaurantId?: string; status?: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'; page: number; limit: number }) {
    return this.prisma.runAsPlatform(async (tx) => {
      const where = {
        ...(filters.restaurantId ? { restaurantId: filters.restaurantId } : {}),
        ...(filters.status ? { status: filters.status } : {})
      };
      const [rows, total] = await Promise.all([
        tx.reconciliationException.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (filters.page - 1) * filters.limit, take: filters.limit }),
        tx.reconciliationException.count({ where })
      ]);
      return { rows, total, page: filters.page, limit: filters.limit };
    });
  }

  async acknowledgeReconciliationException(id: string, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.reconciliationException.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Reconciliation exception not found');
      return tx.reconciliationException.update({ where: { id }, data: { status: 'ACKNOWLEDGED', acknowledgedBy: actor.id, acknowledgedAt: new Date() } });
    });
  }
}
