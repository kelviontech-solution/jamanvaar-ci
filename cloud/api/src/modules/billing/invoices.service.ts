import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateInvoiceDto, RecordPaymentDto } from './dto/invoice.dto';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list(restaurantId?: string, status?: InvoiceStatus) {
    return this.prisma.runAsPlatform(async (tx) => {
      const where: any = {};
      if (restaurantId) where.restaurantId = restaurantId;
      if (status) where.status = status;

      return tx.invoice.findMany({
        where,
        include: {
          restaurant: { select: { id: true, name: true, city: true, gstin: true } },
          plan: { select: { id: true, name: true, tier: true } },
          payments: { orderBy: { createdAt: 'desc' } }
        },
        orderBy: { createdAt: 'desc' }
      });
    });
  }

  async getById(id: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id },
        include: {
          restaurant: { select: { id: true, name: true, legalName: true, address: true, city: true, state: true, gstin: true } },
          plan: { select: { id: true, name: true, tier: true, priceMonthly: true } },
          subscription: { select: { id: true, status: true, startDate: true, expiresAt: true } },
          payments: { orderBy: { createdAt: 'desc' } }
        }
      });
      if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);
      return invoice;
    });
  }

  async create(dto: CreateInvoiceDto, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const restaurant = await tx.restaurant.findUnique({ where: { id: dto.restaurantId } });
      if (!restaurant) throw new NotFoundException('Restaurant not found');

      const year = new Date().getFullYear();
      const count = await tx.invoice.count();
      const invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, '0')}`;

      const totalAmount = dto.amount + dto.taxAmount;

      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          restaurantId: dto.restaurantId,
          subscriptionId: dto.subscriptionId,
          planId: dto.planId,
          amount: dto.amount,
          taxAmount: dto.taxAmount,
          totalAmount,
          currency: 'INR',
          status: 'ISSUED',
          dueDate: new Date(dto.dueDate),
          billingPeriodStart: new Date(dto.billingPeriodStart),
          billingPeriodEnd: new Date(dto.billingPeriodEnd),
          notes: dto.notes
        },
        include: {
          restaurant: { select: { id: true, name: true } },
          plan: { select: { id: true, name: true } }
        }
      });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: dto.restaurantId,
          action: 'INVOICE_CREATED',
          category: 'BILLING',
          details: { invoiceId: invoice.id, invoiceNumber, totalAmount }
        },
        tx
      );

      return invoice;
    });
  }

  async recordPayment(invoiceId: string, dto: RecordPaymentDto, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { payments: true }
      });
      if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);

      if (invoice.status === 'PAID') {
        throw new BadRequestException('Invoice is already marked as PAID');
      }

      const payment = await tx.payment.create({
        data: {
          invoiceId,
          restaurantId: invoice.restaurantId,
          amount: dto.amount,
          method: dto.method,
          referenceNumber: dto.referenceNumber,
          status: 'COMPLETED',
          notes: dto.notes,
          recordedBy: actor.id
        }
      });

      // Check if total paid reaches or exceeds totalAmount
      const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0) + dto.amount;
      const newStatus = totalPaid >= invoice.totalAmount ? 'PAID' : invoice.status;

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: newStatus,
          paidAt: newStatus === 'PAID' ? new Date() : undefined
        },
        include: { payments: true, restaurant: true, plan: true }
      });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: invoice.restaurantId,
          action: 'PAYMENT_RECORDED',
          category: 'BILLING',
          details: { invoiceId, paymentId: payment.id, amount: dto.amount, method: dto.method, totalPaid, newStatus }
        },
        tx
      );

      return updatedInvoice;
    });
  }

  async updateStatus(invoiceId: string, status: InvoiceStatus, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);

      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status,
          paidAt: status === 'PAID' ? new Date() : status === 'VOID' ? null : invoice.paidAt
        }
      });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: invoice.restaurantId,
          action: 'INVOICE_STATUS_UPDATED',
          category: 'BILLING',
          details: { invoiceId, oldStatus: invoice.status, newStatus: status }
        },
        tx
      );

      return updated;
    });
  }

  async getBillingSummary() {
    return this.prisma.runAsPlatform(async (tx) => {
      const [
        totalInvoices,
        paidInvoices,
        pendingInvoices,
        pastDueInvoices,
        allPayments,
        allIssuedInvoices
      ] = await Promise.all([
        tx.invoice.count(),
        tx.invoice.count({ where: { status: 'PAID' } }),
        tx.invoice.count({ where: { status: 'ISSUED' } }),
        tx.invoice.count({ where: { status: 'PAST_DUE' } }),
        tx.payment.findMany({ where: { status: 'COMPLETED' }, select: { amount: true } }),
        tx.invoice.findMany({ select: { totalAmount: true, status: true } })
      ]);

      const totalCollectedPaise = allPayments.reduce((sum, p) => sum + p.amount, 0);
      const pendingPaise = allIssuedInvoices
        .filter((i) => i.status === 'ISSUED' || i.status === 'PAST_DUE')
        .reduce((sum, i) => sum + i.totalAmount, 0);

      return {
        totalInvoices,
        paidInvoices,
        pendingInvoices,
        pastDueInvoices,
        totalCollected: totalCollectedPaise / 100,
        pendingAmount: pendingPaise / 100
      };
    });
  }
}
