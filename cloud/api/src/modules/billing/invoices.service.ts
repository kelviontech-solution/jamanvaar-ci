import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, PaymentMethod, PlatformUser, Prisma } from '@prisma/client';
import { pageOf, parsePaging } from '../../common/paging';
import { ts } from '../../common/sql';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BrandingService, SellerEntity } from '../platform-settings/branding.service';
import { CreateInvoiceDto, RecordPaymentDto, TenantPaymentDto } from './dto/invoice.dto';

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
    private readonly audit: AuditService,
    private readonly branding: BrandingService
  ) {}

  /**
   * Phase 5: a plan with priceYearly set bills that amount over a real 365-day period; one
   * without it keeps the original 30-day/priceMonthly behavior every existing plan fixture
   * (none of which set priceYearly) already relies on. `!= null` (not truthy) so a genuinely
   * free plan (priceYearly: 0) is still treated as annual, not as "unset".
   */
  private billingCycleFor(plan: { priceMonthly: number; priceYearly: number | null }): { amount: number; periodDays: number } {
    if (plan.priceYearly != null) return { amount: plan.priceYearly, periodDays: 365 };
    return { amount: plan.priceMonthly, periodDays: 30 };
  }

  /**
   * Statutory GST 18% calculation engine based on Indian tax jurisdiction.
   * Ahmedabad, Gujarat seller (Code 24):
   * - Buyer in Gujarat: CGST 9% + SGST 9% (Intra-state)
   * - Buyer outside Gujarat: IGST 18% (Inter-state)
   */
  calculateTaxBreakup(amount: number, restaurantState: string | null | undefined, seller: Pick<SellerEntity, 'state' | 'sacCode'>): TaxBreakup {
    const sellerState = seller.state.trim().toLowerCase();
    const isIntraState = !restaurantState || restaurantState.trim().toLowerCase() === sellerState || restaurantState.trim().toLowerCase().includes(sellerState);
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
        sacCode: seller.sacCode
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
        sacCode: seller.sacCode
      };
    }
  }

  /** Formats raw invoice row with complete statutory tax breakdown and balance due */
  private async formatInvoiceWithTax(invoice: any) {
    const seller = await this.branding.seller();
    const tax = this.calculateTaxBreakup(invoice.amount, invoice.restaurant?.state, seller);
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
      seller
    };
  }

  /** Indian financial year label (April-March), e.g. "2026-27". */
  private financialYearLabel(d: Date = new Date()): string {
    const startYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
    return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
  }

  /** Atomic per-key counter (INSERT ... ON CONFLICT ... RETURNING): safe under concurrency and never reused. */
  private async nextSequence(tx: any, key: string): Promise<number> {
    const rows = (await tx.$queryRaw`
      INSERT INTO "InvoiceCounter" ("key", "value") VALUES (${key}, 1)
      ON CONFLICT ("key") DO UPDATE SET "value" = "InvoiceCounter"."value" + 1
      RETURNING "value"`) as Array<{ value: number }>;
    return Number(rows[0].value);
  }

  private async generateInvoiceNumber(tx: any): Promise<string> {
    const fy = this.financialYearLabel();
    const seq = await this.nextSequence(tx, `INV-${fy}`);
    return `INV-${fy}-${String(seq).padStart(4, '0')}`;
  }

  private async generateReceiptNumber(tx: any): Promise<string> {
    const fy = this.financialYearLabel();
    const seq = await this.nextSequence(tx, `RCP-${fy}`);
    return `RCP-${fy}-${String(seq).padStart(4, '0')}`;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Super Admin API Operations
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Plain array without `page`. With `page`, invoices are searched, filtered and paged in the database
   * and returned with per-status counts for the scope (BUG-051). "Overdue" is one rule everywhere:
   * unpaid (ISSUED or PAST_DUE) and past its due date, whatever the stored status currently says.
   */
  async list(query: {
    restaurantId?: string; status?: string; q?: string; overdue?: string; from?: string; to?: string;
    planId?: string; page?: unknown; pageSize?: unknown;
  } = {}) {
    const paging = parsePaging(query);
    const now = new Date();
    const q = query.q?.trim();
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    const scope: Prisma.InvoiceWhereInput = {
      ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
      ...(query.planId ? { planId: query.planId } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(q
        ? { OR: [
            { invoiceNumber: { contains: q, mode: 'insensitive' } },
            { restaurant: { name: { contains: q, mode: 'insensitive' } } }
          ] }
        : {})
    };
    const where: Prisma.InvoiceWhereInput = {
      AND: [
        scope,
        ...(query.status ? [{ status: query.status as InvoiceStatus }] : []),
        ...(query.overdue === 'true' ? [{ status: { in: ['ISSUED', 'PAST_DUE'] as InvoiceStatus[] }, dueDate: { lt: now } }] : [])
      ]
    };
    const include = {
      restaurant: { select: { id: true, name: true, legalName: true, city: true, state: true, gstin: true } },
      plan: { select: { id: true, name: true, tier: true } },
      subscription: { select: { id: true, status: true, startDate: true, expiresAt: true } },
      payments: { orderBy: { createdAt: 'desc' as const } }
    };

    return this.prisma.runAsPlatform(async (tx) => {
      if (!paging.paged) {
        const items = await tx.invoice.findMany({ where, include, orderBy: { createdAt: 'desc' } });
        return Promise.all(items.map((inv) => this.formatInvoiceWithTax(inv)));
      }
      const [items, total, grouped] = await Promise.all([
        tx.invoice.findMany({ where, include, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: paging.skip, take: paging.take }),
        tx.invoice.count({ where }),
        tx.invoice.groupBy({ by: ['status'], where: scope, _count: { _all: true } })
      ]);
      const statusCounts: Record<string, number> = { DRAFT: 0, ISSUED: 0, PAID: 0, PAST_DUE: 0, VOID: 0, REFUNDED: 0 };
      for (const g of grouped) statusCounts[g.status] = g._count._all;
      return { ...pageOf(await Promise.all(items.map((inv) => this.formatInvoiceWithTax(inv))), total, paging), statusCounts };
    });
  }

  /** One row per restaurant that owes money: what, how much is late, since when, last payment, next renewal. */
  async receivables(query: { q?: string; page?: unknown; pageSize?: unknown } = {}) {
    const paging = parsePaging(query);
    const now = new Date();
    const q = query.q?.trim();
    const like = q ? `%${q}%` : null;
    const limit = paging.paged ? paging.take : 1000;
    const offset = paging.paged ? paging.skip : 0;
    return this.prisma.runAsPlatform(async (tx) => {
      const rows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT r.id AS "restaurantId", r.name AS "restaurantName",
          (COALESCE(SUM(i."totalAmount"), 0) / 100.0)::float8 AS outstanding,
          (COALESCE(SUM(i."totalAmount") FILTER (WHERE i."dueDate" < ${ts(now)}), 0) / 100.0)::float8 AS overdue,
          COUNT(i.id)::int AS "unpaidInvoices",
          MIN(i."dueDate") AS "oldestDue",
          (SELECT MAX(p."createdAt") FROM "Payment" p WHERE p."restaurantId" = r.id AND p.status = 'COMPLETED') AS "lastPaymentAt",
          (SELECT MIN(s."expiresAt") FROM "Subscription" s WHERE s."restaurantId" = r.id AND s.status IN ('ACTIVE', 'TRIAL', 'PAST_DUE')) AS "nextRenewal"
        FROM "Restaurant" r
        JOIN "Invoice" i ON i."restaurantId" = r.id AND i.status IN ('ISSUED', 'PAST_DUE')
        WHERE r."deletedAt" IS NULL AND (${like}::text IS NULL OR r.name ILIKE ${like})
        GROUP BY r.id, r.name
        ORDER BY overdue DESC, outstanding DESC, r.name ASC
        LIMIT ${limit} OFFSET ${offset}
      `);
      if (!paging.paged) return rows;
      const totalRows = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
        SELECT COUNT(DISTINCT r.id)::int AS n FROM "Restaurant" r
        JOIN "Invoice" i ON i."restaurantId" = r.id AND i.status IN ('ISSUED', 'PAST_DUE')
        WHERE r."deletedAt" IS NULL AND (${like}::text IS NULL OR r.name ILIKE ${like})
      `);
      return pageOf(rows, totalRows[0]?.n ?? 0, paging);
    });
  }

  /** Unpaid invoices whose due date has passed become PAST_DUE. Run by the scheduler; safe to repeat. */
  async markOverdueInvoices() {
    return this.prisma.runAsPlatform(async (tx) => {
      const due = await tx.invoice.findMany({
        where: { status: 'ISSUED', dueDate: { lt: new Date() } },
        select: { id: true, restaurantId: true, invoiceNumber: true }
      });
      if (!due.length) return { marked: 0 };
      await tx.invoice.updateMany({ where: { id: { in: due.map((d) => d.id) } }, data: { status: 'PAST_DUE' } });
      for (const inv of due) {
        await this.audit.log(
          { actorType: 'SYSTEM', restaurantId: inv.restaurantId, action: 'INVOICE_MARKED_OVERDUE', category: 'BILLING', details: { invoiceId: inv.id, invoiceNumber: inv.invoiceNumber } },
          tx
        );
      }
      return { marked: due.length };
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

      const tax = this.calculateTaxBreakup(dto.amount, restaurant.state, await this.branding.seller());
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
    // One initial invoice per subscription: a second call (a retried onboarding,
    // or a client that also issues its own) returns the existing invoice.
    const existingInitial = await tx.invoice.findFirst({
      where: { subscriptionId, status: { notIn: ['VOID', 'REFUNDED'] } },
      orderBy: { createdAt: 'asc' }
    });
    if (existingInitial) return existingInitial;

    const restaurant = await tx.restaurant.findUnique({ where: { id: restaurantId } });
    const plan = await tx.plan.findUnique({ where: { id: planId } });
    if (!restaurant || !plan) return null;

    const { amount: baseAmount } = this.billingCycleFor(plan);
    const tax = this.calculateTaxBreakup(baseAmount, restaurant.state, await this.branding.seller());
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
      const seller = await this.branding.seller();
      const tax = this.calculateTaxBreakup(invoice.amount, invoice.restaurant.state, seller);
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
        seller,
        taxBreakup: tax
      };
    });
  }

  async updateStatus(invoiceId: string, status: InvoiceStatus, actor: PlatformUser, reason?: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true } });
      if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);

      if (status === 'PAID') {
        // "Paid" must be backed by real payment records - it used to be settable
        // by hand with no payment, so collected revenue and paid status disagreed.
        const paid = invoice.payments.filter((p: any) => p.status === 'COMPLETED').reduce((sum: number, p: any) => sum + p.amount, 0);
        if (paid < invoice.totalAmount) {
          throw new ConflictException('Record a payment for the full invoice amount before marking it PAID');
        }
      }

      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status,
          paidAt: status === 'PAID' ? new Date() : status === 'VOID' ? null : invoice.paidAt,
          ...(reason ? { notes: `${invoice.notes ? invoice.notes + ' | ' : ''}${status}: ${reason}` } : {})
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
          details: { invoiceId, oldStatus: invoice.status, newStatus: status, reason }
        },
        tx
      );

      return this.formatInvoiceWithTax(updated);
    });
  }

  /**
   * Every figure is a database aggregate under one overdue rule (unpaid and past its due date), so
   * the cards, the table and the ageing buckets can never disagree (BUG-053). The collection rate is
   * money collected over money billed, not invoices paid over invoices issued.
   */
  async getBillingSummary(restaurantId?: string) {
    const now = new Date();
    const scope: Prisma.InvoiceWhereInput = restaurantId ? { restaurantId } : {};
    const unpaid = { status: { in: ['ISSUED', 'PAST_DUE'] as InvoiceStatus[] } };
    const ago = (days: number) => new Date(now.getTime() - days * 86400_000);

    return this.prisma.runAsPlatform(async (tx) => {
      const sum = (where: Prisma.InvoiceWhereInput) => tx.invoice.aggregate({ where, _sum: { totalAmount: true }, _count: { _all: true } });
      const [billed, paid, unpaidAgg, overdueAgg, collected, b30, b60, b90, b90plus] = await Promise.all([
        sum({ ...scope, status: { not: 'VOID' } }),
        tx.invoice.count({ where: { ...scope, status: 'PAID' } }),
        sum({ ...scope, ...unpaid }),
        sum({ ...scope, ...unpaid, dueDate: { lt: now } }),
        tx.payment.aggregate({ where: { status: 'COMPLETED', ...(restaurantId ? { restaurantId } : {}) }, _sum: { amount: true } }),
        sum({ ...scope, ...unpaid, dueDate: { lt: now, gte: ago(30) } }),
        sum({ ...scope, ...unpaid, dueDate: { lt: ago(30), gte: ago(60) } }),
        sum({ ...scope, ...unpaid, dueDate: { lt: ago(60), gte: ago(90) } }),
        sum({ ...scope, ...unpaid, dueDate: { lt: ago(90) } })
      ]);
      const rupees = (paise: number | null) => (paise ?? 0) / 100;
      const billedPaise = billed._sum.totalAmount ?? 0;
      const collectedPaise = collected._sum.amount ?? 0;
      const overdueCount = overdueAgg._count._all;
      return {
        totalInvoices: billed._count._all,
        paidInvoices: paid,
        pendingInvoices: unpaidAgg._count._all - overdueCount,
        overdueInvoices: overdueCount,
        // Same number as overdueInvoices, kept for clients written before there was one overdue rule.
        pastDueInvoices: overdueCount,
        totalCollected: rupees(collectedPaise),
        pendingAmount: rupees(unpaidAgg._sum.totalAmount),
        overdueAmount: rupees(overdueAgg._sum.totalAmount),
        collectionRatePercent: billedPaise > 0 ? Math.round((collectedPaise / billedPaise) * 100) : 0,
        ageing: {
          '0-30': rupees(b30._sum.totalAmount),
          '31-60': rupees(b60._sum.totalAmount),
          '61-90': rupees(b90._sum.totalAmount),
          '90+': rupees(b90plus._sum.totalAmount)
        }
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
        const { amount: baseAmount, periodDays } = this.billingCycleFor(sub.plan);
        const nextPeriodStart = new Date(sub.expiresAt);
        const nextPeriodEnd = new Date(nextPeriodStart.getTime() + periodDays * 24 * 60 * 60 * 1000);

        const hasUpcomingInvoice = latestInvoice && (
          latestInvoice.billingPeriodEnd >= nextPeriodStart &&
          latestInvoice.status !== 'VOID' &&
          latestInvoice.status !== 'REFUNDED'
        );

        if (!hasUpcomingInvoice) {
          const tax = this.calculateTaxBreakup(baseAmount, sub.restaurant.state, await this.branding.seller());
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
        latestInvoice: invoices[0] ? await this.formatInvoiceWithTax(invoices[0]) : null
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

      return Promise.all(items.map((inv) => this.formatInvoiceWithTax(inv)));
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
      // security-audit CRIT-02: only ISSUED/PAST_DUE invoices are payable — the old
      // check only rejected PAID, so a self-reported "payment" could still be recorded
      // against a VOID or REFUNDED invoice.
      if (invoice.status !== 'ISSUED' && invoice.status !== 'PAST_DUE') {
        throw new BadRequestException(`Invoice cannot be paid in its current status (${invoice.status})`);
      }

      const alreadyPaid = invoice.payments.filter((p) => p.status === 'COMPLETED').reduce((s, p) => s + p.amount, 0);
      const remainingBalance = Math.max(0, invoice.totalAmount - alreadyPaid);
      if (remainingBalance <= 0) {
        throw new BadRequestException('Invoice has no outstanding balance');
      }
      // security-audit CRIT-02: the amount was previously accepted as any positive
      // integer with no upper bound, so a caller could "overpay" by an arbitrary amount
      // in a single call. Cap it at what is actually still owed.
      const paymentAmount = Math.min(dto.amount || remainingBalance, remainingBalance);
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

      // Only COMPLETED payments count toward "fully paid" — a FAILED/PENDING row must not.
      const totalPaid = alreadyPaid + paymentAmount;
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

      // Renew subscription if fully settled — but security-audit CRIT-02: a self-reported
      // tenant payment must never silently lift a platform-imposed SUSPENDED state (that
      // suspension may be for abuse/policy reasons unrelated to this invoice). Only
      // ACTIVE/TRIAL/PAST_DUE subscriptions are auto-renewed here; a SUSPENDED one still
      // gets the payment recorded (the money isn't lost) but stays suspended until a
      // platform operator reactivates it explicitly.
      const subscriptionIsSuspended = invoice.subscription?.status === 'SUSPENDED';
      if (isFullyPaid && invoice.subscriptionId && !subscriptionIsSuspended) {
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
      } else if (isFullyPaid && subscriptionIsSuspended) {
        await this.audit.log(
          {
            actorType: 'TENANT',
            actorId: userId,
            restaurantId,
            action: 'PAYMENT_RECORDED_WHILE_SUSPENDED',
            category: 'SUBSCRIPTION',
            details: { subscriptionId: invoice.subscriptionId, invoiceId, receiptNumber, note: 'Invoice paid in full but subscription remains SUSPENDED pending platform review' }
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
        invoice: await this.formatInvoiceWithTax(updated),
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

