import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, PaymentMethod, PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateInvoiceDto, RecordPaymentDto, TenantPaymentDto } from './dto/invoice.dto';

export const PLATFORM_BILLING_ENTITY = {
  name: 'JAMANVAAR SaaS Platform',
  legalName: 'KELVIONTECH PRIVATE LIMITED',
  address: 'Plot 42, Science City Road, Sola',
  city: 'Ahmedabad',
  state: 'Gujarat',
  country: 'India',
  pincode: '380060',
  gstin: '24AAACK7890F1ZT',
  sacCode: '997331', // Licensing services for the right to use computer software
  sacDescription: 'Cloud SaaS Platform Subscription & Technical Support',
  supportEmail: 'billing@jamanvaar.app',
  bankName: 'HDFC Bank Ltd',
  bankAccountName: 'KELVIONTECH PRIVATE LIMITED',
  bankAccountNumber: '50200088991122',
  bankIfsc: 'HDFC0001234',
  upiId: 'jamanvaar@hdfcbank'
};

export interface TaxBreakup {
  amount: number; // paise
  taxAmount: number; // paise
  totalAmount: number; // paise
  cgst: number; // paise
  sgst: number; // paise
  igst: number; // paise
  cgstRate: number; // percentage
  sgstRate: number; // percentage
  igstRate: number; // percentage
  isIntraState: boolean;
  sacCode: string;
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  /**
   * Statutory GST 18% calculation engine based on Indian tax jurisdiction.
   * Ahmedabad, Gujarat seller (Code 24):
   * - Buyer in Gujarat: CGST 9% + SGST 9% (Intra-state)
   * - Buyer outside Gujarat: IGST 18% (Inter-state)
   */
  calculateTaxBreakup(amount: number, restaurantState?: string | null): TaxBreakup {
    const isIntraState = !restaurantState || restaurantState.trim().toLowerCase().includes('gujarat');
    const totalTax = Math.round(amount * 0.18);

    if (isIntraState) {
      const cgst = Math.round(totalTax / 2);
      const sgst = totalTax - cgst;
      return {
        amount,
        taxAmount: totalTax,
        totalAmount: amount + totalTax,
        cgst,
        sgst,
        igst: 0,
        cgstRate: 9,
        sgstRate: 9,
        igstRate: 0,
        isIntraState: true,
        sacCode: PLATFORM_BILLING_ENTITY.sacCode
      };
    } else {
      return {
        amount,
        taxAmount: totalTax,
        totalAmount: amount + totalTax,
        cgst: 0,
        sgst: 0,
        igst: totalTax,
        cgstRate: 0,
        sgstRate: 0,
        igstRate: 18,
        isIntraState: false,
        sacCode: PLATFORM_BILLING_ENTITY.sacCode
      };
    }
  }

  /** Formats raw invoice row with complete statutory tax breakdown and balance due */
  private formatInvoiceWithTax(invoice: any) {
    const tax = this.calculateTaxBreakup(invoice.amount, invoice.restaurant?.state);
    const payments = invoice.payments || [];
    const totalPaid = payments
      .filter((p: any) => p.status === 'COMPLETED')
      .reduce((sum: number, p: any) => sum + p.amount, 0);
    const balanceDue = Math.max(0, invoice.totalAmount - totalPaid);

    return {
      ...invoice,
      taxBreakup: tax,
      totalPaid,
      balanceDue,
      isFullyPaid: balanceDue === 0 && invoice.status === 'PAID',
      seller: PLATFORM_BILLING_ENTITY
    };
  }

  private async generateInvoiceNumber(tx: any): Promise<string> {
    const year = new Date().getFullYear();
    const count = await tx.invoice.count();
    return `INV-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  private async generateReceiptNumber(tx: any): Promise<string> {
    const year = new Date().getFullYear();
    const count = await tx.payment.count({ where: { receiptNumber: { not: null } } });
    return `RCP-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Super Admin API Operations
  // ──────────────────────────────────────────────────────────────────────────

  async list(restaurantId?: string, status?: InvoiceStatus) {
    return this.prisma.runAsPlatform(async (tx) => {
      const where: any = {};
      if (restaurantId) where.restaurantId = restaurantId;
      if (status) where.status = status;

      const items = await tx.invoice.findMany({
        where,
        include: {
          restaurant: { select: { id: true, name: true, legalName: true, city: true, state: true, gstin: true } },
          plan: { select: { id: true, name: true, tier: true } },
          subscription: { select: { id: true, status: true, startDate: true, expiresAt: true } },
          payments: { orderBy: { createdAt: 'desc' } }
        },
        orderBy: { createdAt: 'desc' }
      });

      return items.map((inv) => this.formatInvoiceWithTax(inv));
    });
  }

  async getById(id: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id },
        include: {
          restaurant: {
            select: {
              id: true,
              name: true,
              legalName: true,
              address: true,
              city: true,
              state: true,
              country: true,
              gstin: true,
              fssaiNumber: true,
              users: { where: { role: 'OWNER' }, select: { fullName: true, email: true, phone: true } }
            }
          },
          plan: { select: { id: true, name: true, tier: true, priceMonthly: true, entitlements: true } },
          subscription: { select: { id: true, status: true, startDate: true, expiresAt: true } },
          payments: { orderBy: { createdAt: 'desc' } }
        }
      });
      if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);

      return this.formatInvoiceWithTax(invoice);
    });
  }

  async create(dto: CreateInvoiceDto, actor?: PlatformUser | { id: string }) {
    return this.prisma.runAsPlatform(async (tx) => {
      const restaurant = await tx.restaurant.findUnique({ where: { id: dto.restaurantId } });
      if (!restaurant) throw new NotFoundException('Restaurant not found');

      const tax = this.calculateTaxBreakup(dto.amount, restaurant.state);
      const invoiceNumber = await this.generateInvoiceNumber(tx);

      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          restaurantId: dto.restaurantId,
          subscriptionId: dto.subscriptionId,
          planId: dto.planId,
          amount: dto.amount,
          taxAmount: tax.taxAmount,
          totalAmount: tax.totalAmount,
          currency: 'INR',
          status: 'ISSUED',
          dueDate: new Date(dto.dueDate),
          billingPeriodStart: new Date(dto.billingPeriodStart),
          billingPeriodEnd: new Date(dto.billingPeriodEnd),
          notes: dto.notes
        },
        include: {
          restaurant: { select: { id: true, name: true, state: true } },
          plan: { select: { id: true, name: true, tier: true } },
          payments: true
        }
      });

      if (actor) {
        await this.audit.log(
          {
            actorType: 'PLATFORM',
            actorId: actor.id,
            restaurantId: dto.restaurantId,
            action: 'INVOICE_CREATED',
            category: 'BILLING',
            details: { invoiceId: invoice.id, invoiceNumber, totalAmount: tax.totalAmount }
          },
          tx
        );
      }

      return this.formatInvoiceWithTax(invoice);
    });
  }

  /**
   * Atomically issues an initial subscription invoice inside a parent Prisma transaction.
   * Called automatically upon restaurant onboarding or manual plan assignment.
   */
  async createInitialSubscriptionInvoice(
    tx: any,
    restaurantId: string,
    subscriptionId: string,
    planId: string,
    billingPeriodEnd: Date,
    billingPeriodStart: Date = new Date()
  ) {
    const restaurant = await tx.restaurant.findUnique({ where: { id: restaurantId } });
    const plan = await tx.plan.findUnique({ where: { id: planId } });
    if (!restaurant || !plan) return null;

    const baseAmount = plan.priceMonthly; // in paise
    const tax = this.calculateTaxBreakup(baseAmount, restaurant.state);
    const invoiceNumber = await this.generateInvoiceNumber(tx);

    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber,
        restaurantId,
        subscriptionId,
        planId,
        amount: baseAmount,
        taxAmount: tax.taxAmount,
        totalAmount: tax.totalAmount,
        currency: 'INR',
        status: 'ISSUED',
        dueDate: billingPeriodEnd,
        billingPeriodStart,
        billingPeriodEnd,
        notes: `Statutory subscription invoice for ${plan.name} (${plan.tier})`
      }
    });

    return invoice;
  }

  async recordPayment(invoiceId: string, dto: RecordPaymentDto, actorId: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { payments: true, subscription: true }
      });
      if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);

      if (invoice.status === 'PAID') {
        throw new BadRequestException('Invoice is already marked as PAID');
      }

      // Generate statutory receipt number
      const receiptNumber = await this.generateReceiptNumber(tx);

      const payment = await tx.payment.create({
        data: {
          invoiceId,
          restaurantId: invoice.restaurantId,
          amount: dto.amount,
          method: dto.method,
          referenceNumber: dto.referenceNumber,
          receiptNumber,
          status: 'COMPLETED',
          notes: dto.notes,
          recordedBy: actorId
        }
      });

      // Calculate new total paid
      const previousPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
      const totalPaid = previousPaid + dto.amount;
      const isFullyPaid = totalPaid >= invoice.totalAmount;
      const newStatus = isFullyPaid ? 'PAID' : invoice.status;

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: newStatus,
          paidAt: isFullyPaid ? new Date() : undefined
        },
        include: {
          restaurant: { select: { id: true, name: true, legalName: true, state: true, gstin: true } },
          plan: { select: { id: true, name: true, tier: true } },
          subscription: true,
          payments: { orderBy: { createdAt: 'desc' } }
        }
      });

      // If fully paid and linked to a subscription, automatically activate/renew the subscription!
      if (isFullyPaid && invoice.subscriptionId) {
        await tx.subscription.update({
          where: { id: invoice.subscriptionId },
          data: {
            status: 'ACTIVE',
            expiresAt: invoice.billingPeriodEnd
          }
        });

        await this.audit.log(
          {
            actorType: 'PLATFORM',
            actorId,
            restaurantId: invoice.restaurantId,
            action: 'SUBSCRIPTION_RENEWED',
            category: 'SUBSCRIPTION',
            details: {
              subscriptionId: invoice.subscriptionId,
              invoiceId,
              renewedUntil: invoice.billingPeriodEnd.toISOString(),
              receiptNumber
            }
          },
          tx
        );
      }

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId,
          restaurantId: invoice.restaurantId,
          action: 'PAYMENT_RECORDED',
          category: 'BILLING',
          details: { invoiceId, paymentId: payment.id, receiptNumber, amount: dto.amount, method: dto.method, isFullyPaid }
        },
        tx
      );

      return this.formatInvoiceWithTax(updatedInvoice);
    });
  }

  async getReceiptForInvoice(invoiceId: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          restaurant: {
            select: {
              id: true,
              name: true,
              legalName: true,
              address: true,
              city: true,
              state: true,
              country: true,
              gstin: true,
              users: { where: { role: 'OWNER' }, select: { fullName: true, email: true, phone: true } }
            }
          },
          plan: { select: { id: true, name: true, tier: true } },
          subscription: true,
          payments: { where: { status: 'COMPLETED' }, orderBy: { createdAt: 'desc' } }
        }
      });

      if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);
      if (invoice.payments.length === 0) {
        throw new BadRequestException('No completed payment record exists for this invoice');
      }

      const primaryPayment = invoice.payments[0];
      const tax = this.calculateTaxBreakup(invoice.amount, invoice.restaurant.state);
      const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);

      return {
        receiptNumber: primaryPayment.receiptNumber || `RCP-${new Date().getFullYear()}-${primaryPayment.id.slice(0, 4).toUpperCase()}`,
        paymentDate: primaryPayment.createdAt,
        invoiceNumber: invoice.invoiceNumber,
        invoiceId: invoice.id,
        transactionId: primaryPayment.referenceNumber || primaryPayment.id,
        paymentMethod: primaryPayment.method,
        paymentStatus: 'SUCCESS',
        amountPaid: primaryPayment.amount,
        amountPaidRupees: (primaryPayment.amount / 100).toFixed(2),
        totalInvoiceAmount: invoice.totalAmount,
        totalPaid,
        balanceDue: Math.max(0, invoice.totalAmount - totalPaid),
        currency: invoice.currency,
        planName: invoice.plan?.name || 'JAMANVAAR SaaS Platform',
        planTier: invoice.plan?.tier || 'CORE',
        billingPeriodStart: invoice.billingPeriodStart,
        billingPeriodEnd: invoice.billingPeriodEnd,
        receivedFrom: {
          restaurantName: invoice.restaurant.name,
          legalName: invoice.restaurant.legalName || invoice.restaurant.name,
          address: invoice.restaurant.address,
          city: invoice.restaurant.city,
          state: invoice.restaurant.state,
          gstin: invoice.restaurant.gstin,
          ownerName: invoice.restaurant.users?.[0]?.fullName || 'Restaurant Administrator',
          ownerEmail: invoice.restaurant.users?.[0]?.email || ''
        },
        seller: PLATFORM_BILLING_ENTITY,
        taxBreakup: tax
      };
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
        },
        include: {
          restaurant: true,
          plan: true,
          payments: true
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

      return this.formatInvoiceWithTax(updated);
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
        tx.invoice.count({ where: { status: { not: 'VOID' } } }),
        tx.invoice.count({ where: { status: 'PAID' } }),
        tx.invoice.count({ where: { status: 'ISSUED' } }),
        tx.invoice.count({ where: { status: 'PAST_DUE' } }),
        tx.payment.findMany({ where: { status: 'COMPLETED' }, select: { amount: true } }),
        tx.invoice.findMany({
          where: { status: { not: 'VOID' } },
          select: { totalAmount: true, status: true }
        })
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
        pendingAmount: pendingPaise / 100,
        collectionRatePercent: totalInvoices > 0 ? Math.round((paidInvoices / totalInvoices) * 100) : 0
      };
    });
  }

  /**
   * Automated Subscription Renewal Engine.
   * Scans active subscriptions expiring within 7 days.
   * If a renewal invoice has not yet been issued, generates one with status 'ISSUED'.
   * Does NOT prematurely renew the subscription until payment is recorded.
   */
  async checkAndGenerateRenewals() {
    return this.prisma.runAsPlatform(async (tx) => {
      const now = new Date();
      const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const expiringSubscriptions = await tx.subscription.findMany({
        where: {
          status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] },
          expiresAt: { lte: in7Days }
        },
        include: {
          restaurant: { select: { id: true, name: true, state: true } },
          plan: true,
          invoices: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      const generated: string[] = [];
      const updatedPastDue: string[] = [];

      for (const sub of expiringSubscriptions) {
        // If subscription is expired past 3-day grace period and status is ACTIVE, mark PAST_DUE
        const gracePeriodEnd = new Date(sub.expiresAt.getTime() + 3 * 24 * 60 * 60 * 1000);
        if (now > gracePeriodEnd && sub.status === 'ACTIVE') {
          await tx.subscription.update({
            where: { id: sub.id },
            data: { status: 'PAST_DUE' }
          });
          updatedPastDue.push(sub.id);
        }

        // Check if an invoice covering the next renewal period has already been issued
        const latestInvoice = sub.invoices[0];
        const nextPeriodStart = new Date(sub.expiresAt);
        const nextPeriodEnd = new Date(nextPeriodStart.getTime() + 30 * 24 * 60 * 60 * 1000);

        const hasUpcomingInvoice = latestInvoice && (
          latestInvoice.billingPeriodEnd >= nextPeriodStart &&
          latestInvoice.status !== 'VOID' &&
          latestInvoice.status !== 'REFUNDED'
        );

        if (!hasUpcomingInvoice) {
          const baseAmount = sub.plan.priceMonthly;
          const tax = this.calculateTaxBreakup(baseAmount, sub.restaurant.state);
          const invoiceNumber = await this.generateInvoiceNumber(tx);

          const newInvoice = await tx.invoice.create({
            data: {
              invoiceNumber,
              restaurantId: sub.restaurantId,
              subscriptionId: sub.id,
              planId: sub.planId,
              amount: baseAmount,
              taxAmount: tax.taxAmount,
              totalAmount: tax.totalAmount,
              currency: 'INR',
              status: 'ISSUED',
              dueDate: sub.expiresAt,
              billingPeriodStart: nextPeriodStart,
              billingPeriodEnd: nextPeriodEnd,
              notes: `Automatic renewal invoice for ${sub.plan.name} (${sub.plan.tier})`
            }
          });

          generated.push(newInvoice.invoiceNumber);

          await this.audit.log(
            {
              actorType: 'SYSTEM',
              restaurantId: sub.restaurantId,
              action: 'RENEWAL_INVOICE_GENERATED',
              category: 'BILLING',
              details: {
                subscriptionId: sub.id,
                invoiceNumber: newInvoice.invoiceNumber,
                dueDate: sub.expiresAt.toISOString()
              }
            },
            tx
          );
        }
      }

      return {
        scannedCount: expiringSubscriptions.length,
        invoicesGeneratedCount: generated.length,
        generatedInvoiceNumbers: generated,
        markedPastDueCount: updatedPastDue.length
      };
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Restaurant Admin (Tenant-Isolated) Billing Operations
  // ──────────────────────────────────────────────────────────────────────────

  async getTenantBillingSummary(restaurantId: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const [subscription, invoices, payments] = await Promise.all([
        tx.subscription.findFirst({
          where: { restaurantId, status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] } },
          include: { plan: true }
        }),
        tx.invoice.findMany({
          where: { restaurantId, status: { not: 'VOID' } },
          orderBy: { createdAt: 'desc' }
        }),
        tx.payment.findMany({
          where: { restaurantId, status: 'COMPLETED' },
          orderBy: { createdAt: 'desc' }
        })
      ]);

      const unpaidInvoices = invoices.filter((i) => i.status === 'ISSUED' || i.status === 'PAST_DUE');
      const totalDuePaise = unpaidInvoices.reduce((sum, i) => sum + i.totalAmount, 0);
      const totalPaidPaise = payments.reduce((sum, p) => sum + p.amount, 0);

      const now = new Date();
      let daysRemaining = 0;
      if (subscription?.expiresAt) {
        const diffMs = new Date(subscription.expiresAt).getTime() - now.getTime();
        daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      }

      return {
        subscription: subscription ? {
          id: subscription.id,
          status: subscription.status,
          planName: subscription.plan.name,
          planTier: subscription.plan.tier,
          priceMonthly: subscription.plan.priceMonthly / 100,
          expiresAt: subscription.expiresAt,
          daysRemaining
        } : null,
        unpaidInvoicesCount: unpaidInvoices.length,
        totalDue: totalDuePaise / 100,
        totalPaid: totalPaidPaise / 100,
        invoicesCount: invoices.length,
        latestInvoice: invoices[0] ? this.formatInvoiceWithTax(invoices[0]) : null
      };
    });
  }

  async getTenantInvoices(restaurantId: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const items = await tx.invoice.findMany({
        where: { restaurantId, status: { not: 'VOID' } },
        include: {
          restaurant: { select: { id: true, name: true, state: true, gstin: true } },
          plan: { select: { id: true, name: true, tier: true } },
          payments: { orderBy: { createdAt: 'desc' } }
        },
        orderBy: { createdAt: 'desc' }
      });

      return items.map((inv) => this.formatInvoiceWithTax(inv));
    });
  }

  async getTenantInvoiceById(restaurantId: string, invoiceId: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, restaurantId },
        include: {
          restaurant: {
            select: {
              id: true,
              name: true,
              legalName: true,
              address: true,
              city: true,
              state: true,
              country: true,
              gstin: true,
              fssaiNumber: true,
              users: { where: { role: 'OWNER' }, select: { fullName: true, email: true, phone: true } }
            }
          },
          plan: { select: { id: true, name: true, tier: true, priceMonthly: true } },
          subscription: true,
          payments: { orderBy: { createdAt: 'desc' } }
        }
      });

      if (!invoice) throw new NotFoundException('Invoice not found');
      return this.formatInvoiceWithTax(invoice);
    });
  }

  async processTenantPayment(restaurantId: string, invoiceId: string, dto: TenantPaymentDto, userId: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, restaurantId },
        include: { payments: true, subscription: true }
      });

      if (!invoice) throw new NotFoundException('Invoice not found');
      if (invoice.status === 'PAID') {
        throw new BadRequestException('Invoice is already paid');
      }

      const paymentAmount = dto.amount || invoice.totalAmount;
      const receiptNumber = await this.generateReceiptNumber(tx);
      const referenceNumber = dto.referenceNumber || `TXN-UPI-${Date.now().toString().slice(-8)}`;

      const payment = await tx.payment.create({
        data: {
          invoiceId,
          restaurantId,
          amount: paymentAmount,
          method: dto.method || 'UPI',
          referenceNumber,
          receiptNumber,
          status: 'COMPLETED',
          notes: dto.notes || 'Online Restaurant Admin payment',
          recordedBy: `TENANT_USER:${userId}`
        }
      });

      const totalPaid = invoice.payments.reduce((s, p) => s + p.amount, 0) + paymentAmount;
      const isFullyPaid = totalPaid >= invoice.totalAmount;
      const newStatus = isFullyPaid ? 'PAID' : invoice.status;

      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: newStatus,
          paidAt: isFullyPaid ? new Date() : undefined
        },
        include: {
          restaurant: true,
          plan: true,
          subscription: true,
          payments: { orderBy: { createdAt: 'desc' } }
        }
      });

      // Renew subscription if fully settled
      if (isFullyPaid && invoice.subscriptionId) {
        await tx.subscription.update({
          where: { id: invoice.subscriptionId },
          data: {
            status: 'ACTIVE',
            expiresAt: invoice.billingPeriodEnd
          }
        });

        await this.audit.log(
          {
            actorType: 'TENANT',
            actorId: userId,
            restaurantId,
            action: 'SUBSCRIPTION_RENEWED',
            category: 'SUBSCRIPTION',
            details: {
              subscriptionId: invoice.subscriptionId,
              invoiceId,
              receiptNumber,
              renewedUntil: invoice.billingPeriodEnd.toISOString()
            }
          },
          tx
        );
      }

      await this.audit.log(
        {
          actorType: 'TENANT',
          actorId: userId,
          restaurantId,
          action: 'PAYMENT_COMPLETED',
          category: 'BILLING',
          details: { invoiceId, receiptNumber, amount: paymentAmount, method: dto.method }
        },
        tx
      );

      return {
        success: true,
        invoice: this.formatInvoiceWithTax(updated),
        payment: {
          id: payment.id,
          receiptNumber,
          amount: payment.amount,
          referenceNumber,
          method: payment.method,
          paidAt: payment.createdAt
        }
      };
    });
  }

  async getTenantReceipt(restaurantId: string, invoiceId: string) {
    const invoice = await this.prisma.runAsPlatform((tx) =>
      tx.invoice.findUnique({ where: { id: invoiceId }, select: { restaurantId: true } })
    );
    if (!invoice || invoice.restaurantId !== restaurantId) {
      throw new NotFoundException('Receipt not found');
    }
    return this.getReceiptForInvoice(invoiceId);
  }
}

