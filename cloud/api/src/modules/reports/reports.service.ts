import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ts } from '../../common/sql';
import { toCsv } from '../../common/csv';
import { deviceHealth, healthWhere } from '../../common/device-health';

type DateRange = { from?: string; to?: string };

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** `to` undefined means "through now"; `from` undefined means "since the beginning" — both are left open rather than defaulted, unlike getRestaurantSales's own 30-day default, because an omitted range here means the caller asked for All-Time. */
  private static parseRange(range: DateRange): { from?: Date; to?: Date } {
    const from = range.from ? new Date(range.from) : undefined;
    const to = range.to ? new Date(range.to) : undefined;
    return {
      from: from && !Number.isNaN(from.getTime()) ? from : undefined,
      to: to && !Number.isNaN(to.getTime()) ? to : undefined
    };
  }

  /**
   * The restaurant's own sales, from the orders its terminals synced (BUG-041) - deliberately separate
   * from the platform's invoices to that restaurant. A sale is a paid, non-cancelled order. Amounts are
   * in rupees (orders are stored in paise). Defaults to the last 30 days.
   */
  async getRestaurantSales(restaurantId: string, range: { from?: string; to?: string } = {}) {
    const to = range.to ? new Date(range.to) : new Date();
    const from = range.from ? new Date(range.from) : new Date(to.getTime() - 30 * 86400_000);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) throw new BadRequestException('Invalid sales date range');
    const inRange = Prisma.sql`o."restaurantId" = ${restaurantId} AND o."createdAt" >= ${ts(from)} AND o."createdAt" <= ${ts(to)}`;
    const isSale = Prisma.sql`o.collected >= o."totalAmount" AND (o."ledgerEntries" > 0 OR o."paymentStatus" IN ('SUCCESS', 'PAID', 'PARTIALLY_REFUNDED', 'REFUND_PENDING', 'REFUNDED')) AND o.status NOT IN ('DRAFT', 'CANCELLED', 'VOID')`;
    const rupees = (n: unknown) => Math.round(Number(n ?? 0)) / 100;

    return this.prisma.runAsPlatform(async (tx) => {
      const restaurant = await tx.restaurant.findFirst({ where: { id: restaurantId, deletedAt: null }, select: { id: true, name: true, timezone: true } });
      if (!restaurant) throw new NotFoundException('Restaurant not found');

      // Read-only report: never synthesize ledger entries while opening a dashboard. Prefer the
      // append-only ledger; legacy status/meta fallback is explicit and counted for reconciliation.
      // This is an order-created cohort, with collections/refunds known by the requested end time.
      const cohort = Prisma.sql`WITH scoped AS (
        SELECT o.*, COALESCE(b.timezone, ${restaurant.timezone}) AS "reportTimezone",
          COALESCE(l.entries, 0) AS "ledgerEntries",
          CASE WHEN l.entries > 0 THEN COALESCE(l.collected, 0)
            WHEN o."paymentStatus" IN ('SUCCESS', 'PAID', 'PARTIALLY_REFUNDED', 'REFUND_PENDING', 'REFUNDED') THEN o."totalAmount"
            ELSE 0 END::bigint AS collected,
          CASE WHEN l.entries > 0 THEN COALESCE(l.refunded, 0)
            WHEN jsonb_typeof(o.meta->'refundAmountPaise') = 'number' THEN LEAST(o."totalAmount", GREATEST(0, (o.meta->>'refundAmountPaise')::numeric))
            WHEN o."paymentStatus" = 'REFUNDED' OR o.status = 'REFUNDED' THEN o."totalAmount"
            ELSE 0 END::bigint AS refunded
        FROM "SyncedOrder" o
        LEFT JOIN "Branch" b ON b.id = o."branchId" AND b."restaurantId" = o."restaurantId"
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS entries,
            SUM(e.amount) FILTER (WHERE e.kind = 'COLLECTION' AND e."createdAt" <= ${ts(to)}) AS collected,
            SUM(e.amount) FILTER (WHERE e.kind = 'REFUND' AND e."createdAt" <= ${ts(to)}) AS refunded
          FROM "OrderPaymentEntry" e WHERE e."orderId" = o.id AND e."restaurantId" = o."restaurantId"
        ) l ON true WHERE ${inRange}
      )`;

      const [totals, byDay, byMethod, byBranch, topItems, anyOrder] = await Promise.all([
        tx.$queryRaw<Array<{ orders: number; sales: number; gross: number; refunds: number; collected: number; outstanding: number; legacy: number; open: number; cancelled: number }>>(Prisma.sql`${cohort}
          SELECT COUNT(*) FILTER (WHERE ${isSale})::int AS orders,
                 COALESCE(SUM(o."totalAmount" - o.refunded) FILTER (WHERE ${isSale}), 0)::float8 AS sales,
                 COALESCE(SUM(o."totalAmount") FILTER (WHERE ${isSale}), 0)::float8 AS gross,
                 COALESCE(SUM(o.refunded), 0)::float8 AS refunds,
                 COALESCE(SUM(o.collected), 0)::float8 AS collected,
                 COALESCE(SUM(GREATEST(0, o."totalAmount" - o.collected)) FILTER (WHERE o.status NOT IN ('CANCELLED', 'VOID', 'REFUNDED')), 0)::float8 AS outstanding,
                 COUNT(*) FILTER (WHERE o."ledgerEntries" = 0 AND o.collected > 0)::int AS legacy,
                 COUNT(*) FILTER (WHERE o.collected < o."totalAmount" AND o.status NOT IN ('CANCELLED', 'VOID', 'REFUNDED'))::int AS open,
                 COUNT(*) FILTER (WHERE o.status IN ('CANCELLED', 'VOID'))::int AS cancelled
          FROM scoped o`),
        tx.$queryRaw<Array<{ date: Date; orders: number; sales: number }>>(Prisma.sql`
          ${cohort} SELECT ((o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE o."reportTimezone")::date AS date,
            COUNT(*)::int AS orders, SUM(o."totalAmount" - o.refunded)::float8 AS sales
          FROM scoped o WHERE ${isSale} GROUP BY 1 ORDER BY 1 ASC`),
        tx.$queryRaw<Array<{ method: string; orders: number; sales: number }>>(Prisma.sql`
          ${cohort} SELECT COALESCE(o."paymentMethod", 'UNKNOWN') AS method, COUNT(*)::int AS orders, SUM(o."totalAmount" - o.refunded)::float8 AS sales
          FROM scoped o WHERE ${isSale} GROUP BY 1 ORDER BY sales DESC`),
        tx.$queryRaw<Array<{ branchId: string | null; branchName: string; orders: number; sales: number }>>(Prisma.sql`
          ${cohort} SELECT o."branchId" AS "branchId", COALESCE(b.name, 'Unassigned') AS "branchName", COUNT(*)::int AS orders, SUM(o."totalAmount" - o.refunded)::float8 AS sales
          FROM scoped o LEFT JOIN "Branch" b ON b.id = o."branchId" AND b."restaurantId" = o."restaurantId"
          WHERE ${isSale} GROUP BY o."branchId", b.name ORDER BY sales DESC`),
        tx.$queryRaw<Array<{ name: string; quantity: number; revenue: number }>>(Prisma.sql`
          ${cohort} SELECT it->>'name' AS name, SUM((it->>'quantity')::numeric)::float8 AS quantity, SUM(COALESCE((it->>'lineTotal')::numeric, 0))::float8 AS revenue
          FROM scoped o, jsonb_array_elements(o.items) it
          WHERE ${isSale} AND it->>'name' IS NOT NULL GROUP BY 1 ORDER BY revenue DESC, quantity DESC LIMIT 10`),
        tx.syncedOrder.count({ where: { restaurantId } })
      ]);

      const t = totals[0] ?? { orders: 0, sales: 0, gross: 0, refunds: 0, collected: 0, outstanding: 0, legacy: 0, open: 0, cancelled: 0 };
      const sales = rupees(t.sales);
      return {
        source: 'RESTAURANT_SYNCED_ORDERS',
        note: "Restaurant orders created in this period, not the platform's invoices. Gross sales are settled bill totals after discounts and including billed tax; sales subtract confirmed refunds known by period end. Payment-method groups use the order's primary method; top-item revenue uses stored line totals before bill-level returns. Legacy orders without ledger entries use their recorded settlement state.",
        metricBasis: 'ORDER_CREATED_COHORT',
        dateBasis: 'BRANCH_LOCAL_CALENDAR_DATE',
        restaurant,
        period: { from: from.toISOString(), to: to.toISOString() },
        hasData: anyOrder > 0,
        totals: {
          orders: t.orders,
          sales,
          grossSales: rupees(t.gross),
          refunds: rupees(t.refunds),
          collections: rupees(t.collected),
          netCollections: rupees(t.collected - t.refunds),
          outstanding: rupees(t.outstanding),
          legacySettledOrders: t.legacy,
          averageOrder: t.orders > 0 ? Math.round((sales / t.orders) * 100) / 100 : 0,
          openOrders: t.open,
          cancelledOrders: t.cancelled
        },
        byDay: byDay.map((d) => ({ date: new Date(d.date).toISOString().slice(0, 10), orders: d.orders, sales: rupees(d.sales) })),
        byPaymentMethod: byMethod.map((m) => ({ method: m.method, orders: m.orders, sales: rupees(m.sales) })),
        byBranch: byBranch.map((b) => ({ branchId: b.branchId, branchName: b.branchName, orders: b.orders, sales: rupees(b.sales) })),
        topItems: topItems.map((i) => ({ name: i.name, quantity: Number(i.quantity), revenue: rupees(i.revenue) }))
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async getSummary() {
    const [
      totalRestaurants,
      activeRestaurants,
      suspendedRestaurants,
      totalBranches,
      totalDevices,
      onlineDevices,
      degradedDevices,
      offlineDevices,
      revokedDevices,
      pendingDevices,
      neverSeenDevices,
      totalSubscriptions,
      activeSubscriptions,
      invoiceTotals
    ] = await Promise.all([
      this.prisma.platformDb.restaurant.count({ where: { deletedAt: null } }),
      this.prisma.platformDb.restaurant.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.platformDb.restaurant.count({ where: { status: 'SUSPENDED', deletedAt: null } }),
      this.prisma.platformDb.branch.count({ where: { status: 'ACTIVE' } }),
      this.prisma.platformDb.device.count(),
      // EC-10: "active" used to mean registration status ACTIVE, and "offline" was just total minus
      // that — a revoked device was never excluded from the offline count, and a long-silent-but-
      // still-ACTIVE terminal was counted the same as one that heartbeat a second ago. Using the
      // same deviceHealth/healthWhere thresholds every other device list already uses instead.
      this.prisma.platformDb.device.count({ where: healthWhere('online') }),
      this.prisma.platformDb.device.count({ where: healthWhere('degraded') }),
      this.prisma.platformDb.device.count({ where: healthWhere('offline') }),
      this.prisma.platformDb.device.count({ where: healthWhere('revoked') }),
      this.prisma.platformDb.device.count({ where: healthWhere('pending') }),
      this.prisma.platformDb.device.count({ where: healthWhere('never_seen') }),
      this.prisma.platformDb.subscription.count(),
      this.prisma.platformDb.subscription.count({ where: { status: 'ACTIVE' } }),
      this.prisma.platformDb.invoice.groupBy({ by: ['status'], _sum: { totalAmount: true } })
    ]);

    const collectedPaise = invoiceTotals.find((i) => i.status === 'PAID')?._sum.totalAmount ?? 0;
    const outstandingPaise = invoiceTotals.filter((i) => ['ISSUED', 'PAST_DUE', 'DRAFT'].includes(i.status))
      .reduce((sum, i) => sum + (i._sum.totalAmount ?? 0), 0);
    const mrr = await this.prisma.runAsPlatform((tx) => tx.$queryRaw<Array<{ amount: number }>>(Prisma.sql`
      SELECT COALESCE(SUM(p."priceMonthly"), 0)::float8 AS amount
      FROM "Subscription" s JOIN "Plan" p ON p.id = s."planId" WHERE s.status = 'ACTIVE'`));
    const mrrPaise = Number(mrr[0]?.amount ?? 0);
    const arrPaise = mrrPaise * 12;

    return {
      restaurants: {
        total: totalRestaurants,
        active: activeRestaurants,
        suspended: suspendedRestaurants
      },
      branches: {
        total: totalBranches
      },
      devices: {
        total: totalDevices,
        // "active" now means actually communicating (online or degraded-but-recent), not merely a
        // registration status — matches what an operator diagnosing lost connectivity needs to see.
        active: onlineDevices + degradedDevices,
        online: onlineDevices,
        degraded: degradedDevices,
        offline: offlineDevices,
        revoked: revokedDevices,
        pending: pendingDevices,
        neverSeen: neverSeenDevices
      },
      subscriptions: {
        total: totalSubscriptions,
        active: activeSubscriptions
      },
      revenue: {
        mrr: Math.round(mrrPaise / 100),
        arr: Math.round(arrPaise / 100),
        collectedRevenue: Math.round(collectedPaise / 100),
        outstandingReceivables: Math.round(outstandingPaise / 100)
      }
    };
  }

  async getRevenue(range: DateRange = {}) {
    const { from, to } = ReportsService.parseRange(range);
    const createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    const dateFilter = from || to ? { createdAt } : {};
    const [invoices, totals] = await Promise.all([
      this.prisma.platformDb.invoice.findMany({ where: dateFilter, include: { plan: true, restaurant: true }, orderBy: { createdAt: 'desc' }, take: 10 }),
      this.prisma.runAsPlatform((tx) => tx.$queryRaw<Array<{ tier: string; revenue: number; count: number }>>(Prisma.sql`
        SELECT p.tier::text AS tier, SUM(i."totalAmount")::float8 AS revenue, COUNT(*)::int AS count
        FROM "Invoice" i JOIN "Plan" p ON p.id = i."planId"
        WHERE (${from ?? null}::timestamptz IS NULL OR i."createdAt" >= ${from ?? null})
          AND (${to ?? null}::timestamptz IS NULL OR i."createdAt" <= ${to ?? null})
        GROUP BY p.tier`))
    ]);
    // Tier price labels used to be hardcoded (CORE ₹5,000 / PRO ₹7,000) regardless of what plans
    // actually exist now — stale the moment a plan's price changes, and silently wrong for any
    // tier beyond those two. Derived here from the live Plan catalog instead.
    const planPrices = await this.prisma.platformDb.plan.groupBy({ by: ['tier'], _avg: { priceMonthly: true } });
    const priceByTier = new Map(planPrices.map((p) => [p.tier, Math.round((p._avg.priceMonthly ?? 0) / 100)]));
    return {
      period: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
      byPlan: totals.map((t) => ({
        tier: t.tier,
        name: `JAMANVAAR ${t.tier}`,
        revenue: Math.round(Number(t.revenue ?? 0) / 100),
        count: t.count,
        priceMonthly: priceByTier.get(t.tier as never) ?? null
      })),
      recentInvoices: invoices.slice(0, 10).map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        restaurantName: i.restaurant.name,
        planName: i.plan?.name ?? 'Custom Plan',
        total: Math.round(i.totalAmount / 100),
        status: i.status,
        issuedAt: i.createdAt.toISOString()
      }))
    };
  }

  private static readonly COST_SETTING_KEY = 'reports.assumedMonthlyCostPerRestaurantPaise';
  private static readonly DEFAULT_ASSUMED_COST_PAISE = 15000; // ₹150/mo -- a starting estimate, editable by Super Admin

  /**
   * Super Admin feature request: margin/cost view. Reports showed revenue but nothing about what it
   * actually costs to serve a restaurant (support load, infra) against what it pays. JAMANVAAR does
   * not track real per-restaurant infra cost anywhere yet, so this is explicitly an ESTIMATE built
   * from a single admin-editable assumption (₹/restaurant/month), not real billing data -- labeled
   * as such in the API response and the page, not presented as audited numbers.
   */
  async getMargins() {
    const [subscriptions, setting] = await Promise.all([
      this.prisma.runAsPlatform((tx) =>
        tx.subscription.findMany({
          where: { status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] } },
          include: { plan: { select: { id: true, name: true, tier: true, priceMonthly: true } } }
        })
      ),
      this.prisma.runAsPlatform((tx) => tx.platformSetting.findUnique({ where: { key: ReportsService.COST_SETTING_KEY } }))
    ]);
    const assumedCostPaise = (setting?.value as { paise: number } | undefined)?.paise ?? ReportsService.DEFAULT_ASSUMED_COST_PAISE;

    const byPlan = new Map<string, { planId: string; name: string; tier: string; restaurantCount: number; mrrPaise: number }>();
    for (const sub of subscriptions) {
      if (!sub.plan) continue;
      const row = byPlan.get(sub.plan.id) ?? { planId: sub.plan.id, name: sub.plan.name, tier: sub.plan.tier, restaurantCount: 0, mrrPaise: 0 };
      row.restaurantCount += 1;
      row.mrrPaise += sub.plan.priceMonthly;
      byPlan.set(sub.plan.id, row);
    }

    const plans = [...byPlan.values()]
      .map((p) => {
        const assumedCostTotalPaise = p.restaurantCount * assumedCostPaise;
        return {
          planId: p.planId,
          name: p.name,
          tier: p.tier,
          restaurantCount: p.restaurantCount,
          mrr: Math.round(p.mrrPaise / 100),
          assumedCost: Math.round(assumedCostTotalPaise / 100),
          estimatedMargin: Math.round((p.mrrPaise - assumedCostTotalPaise) / 100)
        };
      })
      .sort((a, b) => b.mrr - a.mrr);

    const totalMrrPaise = plans.reduce((sum, p) => sum + p.mrr * 100, 0);
    const totalCostPaise = plans.reduce((sum, p) => sum + p.assumedCost * 100, 0);

    return {
      assumedCostPerRestaurant: Math.round(assumedCostPaise / 100),
      plans,
      totals: { mrr: Math.round(totalMrrPaise / 100), assumedCost: Math.round(totalCostPaise / 100), estimatedMargin: Math.round((totalMrrPaise - totalCostPaise) / 100) }
    };
  }

  async setAssumedMonthlyCost(rupees: number) {
    const paise = Math.round(rupees * 100);
    await this.prisma.runAsPlatform((tx) =>
      tx.platformSetting.upsert({
        where: { key: ReportsService.COST_SETTING_KEY },
        update: { value: { paise } },
        create: { key: ReportsService.COST_SETTING_KEY, value: { paise }, category: 'REPORTS', description: 'Assumed monthly cost (₹) to serve one restaurant, used only for the estimated margin view' }
      })
    );
    return this.getMargins();
  }

  async getRestaurants(range: DateRange = {}) {
    const { from, to } = ReportsService.parseRange(range);
    // "total" and "cityBreakdown" are a point-in-time snapshot of the whole fleet (not meaningfully
    // time-ranged); only the "recent onboardings" list below is actually bounded by the selected
    // period, via `period` in the response.
    const dateFilter = from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
    const [restaurants, cities, total] = await Promise.all([
      this.prisma.platformDb.restaurant.findMany({ where: { deletedAt: null, ...dateFilter },
        include: { _count: { select: { branches: true, devices: true } }, subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
        orderBy: { createdAt: 'desc' }, take: 15 }),
      this.prisma.platformDb.restaurant.groupBy({ by: ['city'], where: { deletedAt: null }, _count: true }),
      this.prisma.platformDb.restaurant.count({ where: { deletedAt: null } })
    ]);
    const cityMap = new Map<string, number>();
    for (const c of cities) { const city = c.city || 'Unknown'; cityMap.set(city, (cityMap.get(city) ?? 0) + c._count); }
    const cityBreakdown = Array.from(cityMap, ([city, count]) => ({ city, count }));
    return {
      period: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
      total,
      cityBreakdown,
      list: restaurants.slice(0, 15).map((r) => ({
        id: r.id,
        name: r.name,
        city: r.city,
        status: r.status,
        branchCount: r._count.branches,
        deviceCount: r._count.devices,
        activePlan: r.subscriptions[0]?.plan.name ?? 'No Plan',
        createdAt: r.createdAt.toISOString()
      }))
    };
  }

  async getDevices(range: DateRange = {}) {
    const { from, to } = ReportsService.parseRange(range);
    // "total" and "byType" are the current fleet composition (point-in-time); the "fleet status"
    // list below is bounded by the selected period, filtered by lastSeenAt so the range answers
    // "what reported in this window", not "what was registered in this window".
    const lastSeenFilter = from || to ? { lastSeenAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
    const [devices, counts, total] = await Promise.all([
      this.prisma.platformDb.device.findMany({ where: lastSeenFilter, include: { restaurant: true, branch: true }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.platformDb.device.groupBy({ by: ['type'], _count: true }),
      this.prisma.platformDb.device.count()
    ]);
    const typeCounts: Record<string, number> = { POS: 0, CAPTAIN: 0, KDS: 0, KIOSK: 0, POS_ADMIN: 0, KIOSK_ADMIN: 0 };
    for (const c of counts) typeCounts[c.type] = c._count;
    return {
      period: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
      total,
      byType: Object.entries(typeCounts).map(([type, count]) => ({ type, count })),
      list: devices.slice(0, 20).map((d) => ({
        id: d.id,
        restaurantName: d.restaurant.name,
        branchName: d.branch?.name ?? 'Main',
        type: d.type,
        appVersion: d.appVersion,
        status: d.status,
        lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
        syncStatus: d.syncStatus
      }))
    };
  }

  async getSubscriptions(range: DateRange = {}) {
    const { from, to } = ReportsService.parseRange(range);
    // "total" and "byStatus" are the current lifecycle snapshot; the list below is bounded by
    // startDate within the selected period (subscriptions that began in that window).
    const startFilter = from || to ? { startDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
    const [subscriptions, counts, total] = await Promise.all([
      this.prisma.platformDb.subscription.findMany({ where: startFilter, include: { restaurant: true, plan: true }, orderBy: { createdAt: 'desc' }, take: 15 }),
      this.prisma.platformDb.subscription.groupBy({ by: ['status'], _count: true }),
      this.prisma.platformDb.subscription.count()
    ]);
    const statusCounts: Record<string, number> = { ACTIVE: 0, TRIAL: 0, PAST_DUE: 0, SUSPENDED: 0, EXPIRED: 0 };
    for (const c of counts) statusCounts[c.status] = c._count;
    return {
      period: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
      total,
      byStatus: Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
      list: subscriptions.slice(0, 15).map((s) => ({
        id: s.id,
        restaurantName: s.restaurant.name,
        planName: s.plan.name,
        tier: s.plan.tier,
        status: s.status,
        startDate: s.startDate.toISOString(),
        expiresAt: s.expiresAt.toISOString()
      }))
    };
  }

  // B2-061: restaurant/plan names are free text (set by whoever created the restaurant, e.g. via
  // the platform onboarding form) reaching every one of these CSVs with only a quote-escape
  // before this fix — no defense against CSV/formula injection. toCsv sanitizes every field.
  async generateCsv(reportType: string, range: DateRange = {}): Promise<string> {
    const { from, to } = ReportsService.parseRange(range);
    const createdAtFilter = from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
    if (reportType === 'revenue') {
      const invoices = await this.prisma.platformDb.invoice.findMany({
        where: createdAtFilter,
        include: { restaurant: true, plan: true }
      });
      // BUG-LOW-002: was '(INR)' text — the super-admin-web frontend's own
      // invoice CSV/table for this same data (BillingPage.tsx) already
      // labels these columns '(₹)'; matching that instead of a second,
      // inconsistent convention for the same figures.
      const headers = ['Invoice Number', 'Restaurant', 'Plan', 'Subtotal (₹)', 'Tax Amount (₹)', 'Total (₹)', 'Status', 'Issued At'];
      const rows = invoices.map((i) => [
        i.invoiceNumber,
        i.restaurant.name,
        i.plan?.name ?? 'Custom Plan',
        (i.amount / 100).toFixed(2),
        (i.taxAmount / 100).toFixed(2),
        (i.totalAmount / 100).toFixed(2),
        i.status,
        i.createdAt.toISOString()
      ]);
      return toCsv(headers, rows);
    }

    if (reportType === 'restaurants') {
      const restaurants = await this.prisma.platformDb.restaurant.findMany({
        where: { deletedAt: null, ...createdAtFilter },
        include: { branches: true, subscriptions: { include: { plan: true } } }
      });
      const headers = ['ID', 'Restaurant Name', 'City', 'State', 'Status', 'Branches', 'Plan', 'Created At'];
      const rows = restaurants.map((r) => [
        r.id,
        r.name,
        r.city ?? '',
        r.state ?? '',
        r.status,
        r.branches.length,
        r.subscriptions[0]?.plan.name ?? 'None',
        r.createdAt.toISOString()
      ]);
      return toCsv(headers, rows);
    }

    // Default subscriptions CSV
    const startDateFilter = from || to ? { startDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
    const subs = await this.prisma.platformDb.subscription.findMany({
      where: startDateFilter,
      include: { restaurant: true, plan: true }
    });
    const headers = ['ID', 'Restaurant', 'Plan Tier', 'Price Monthly', 'Status', 'Start Date', 'Expires At'];
    const rows = subs.map((s) => [
      s.id,
      s.restaurant.name,
      s.plan.tier,
      (s.plan.priceMonthly / 100).toFixed(2),
      s.status,
      s.startDate.toISOString(),
      s.expiresAt.toISOString()
    ]);
    return toCsv(headers, rows);
  }

  async getRestaurantReport(restaurantId: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const restaurant = await tx.restaurant.findUnique({
        where: { id: restaurantId },
        include: {
          branches: true,
          devices: true,
          subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' }, take: 1 },
          invoices: { orderBy: { createdAt: 'desc' } }
        }
      });
      if (!restaurant) throw new NotFoundException('Restaurant not found');

      const branchesCount = restaurant.branches.length;
      const devicesCount = restaurant.devices.length;
      const activeDevices = restaurant.devices.filter((d) => d.status === 'ACTIVE').length;
      // B2-058: was `devicesCount - activeDevices`, which lumps REVOKED devices in with genuinely
      // offline ones ("15 offline / standby" was actually 14 revoked devices from one test probe
      // plus 1 earlier — a revoked terminal is gone, not on standby, same class as BUG-067, whose
      // fix already exists as the shared `deviceHealth()` helper — this screen's own metric just
      // wasn't using it). Only devices that are ACTIVE but stale/silent count as offline here now.
      const now = new Date();
      const offlineDevices = restaurant.devices.filter((d) => deviceHealth(d, now) === 'offline' || deviceHealth(d, now) === 'degraded').length;

      const deviceTypeBreakdown: Record<string, number> = {};
      for (const d of restaurant.devices) {
        deviceTypeBreakdown[d.type] = (deviceTypeBreakdown[d.type] || 0) + 1;
      }

      const totalInvoices = restaurant.invoices.length;
      const totalBilledPaise = restaurant.invoices.reduce((sum, i) => sum + i.totalAmount, 0);
      const collectedPaise = restaurant.invoices
        .filter((i) => i.status === 'PAID')
        .reduce((sum, i) => sum + i.totalAmount, 0);
      const outstandingPaise = restaurant.invoices
        .filter((i) => i.status === 'ISSUED' || i.status === 'PAST_DUE')
        .reduce((sum, i) => sum + i.totalAmount, 0);

      // Backups and sync telemetry
      const backupsCount = await tx.backup.count({ where: { restaurantId } });
      const lastBackup = await tx.backup.findFirst({
        where: { restaurantId },
        orderBy: { createdAt: 'desc' }
      });

      const syncEventsCount = await tx.syncEventLog.count({ where: { restaurantId } });
      const pendingConflictsCount = await tx.syncConflict.count({
        where: { restaurantId, resolution: 'PENDING' }
      });

      const activeSub = restaurant.subscriptions[0];

      return {
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          city: restaurant.city,
          state: restaurant.state,
          status: restaurant.status
        },
        subscription: activeSub
          ? {
              planName: activeSub.plan.name,
              tier: activeSub.plan.tier,
              status: activeSub.status,
              priceMonthly: Math.round(activeSub.plan.priceMonthly / 100),
              expiresAt: activeSub.expiresAt.toISOString()
            }
          : null,
        metrics: {
          branchesCount,
          devicesCount,
          activeDevices,
          offlineDevices,
          deviceTypeBreakdown,
          totalInvoices,
          totalBilled: Math.round(totalBilledPaise / 100),
          collectedRevenue: Math.round(collectedPaise / 100),
          outstandingReceivables: Math.round(outstandingPaise / 100),
          backupsCount,
          lastBackupAt: lastBackup?.createdAt.toISOString() || null,
          lastBackupStatus: lastBackup?.status || null,
          syncEventsCount,
          pendingConflictsCount
        }
      };
    });
  }
}
