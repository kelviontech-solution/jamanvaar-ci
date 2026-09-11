import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentTransactionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface PlatformPaymentFilters {
  restaurantId?: string;
  status?: PaymentTransactionStatus;
  page: number;
  limit: number;
}

@Injectable()
export class PlatformPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
