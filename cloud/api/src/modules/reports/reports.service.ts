import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ts } from '../../common/sql';
import { toCsv } from '../../common/csv';
import { deviceHealth } from '../../common/device-health';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The restaurant's own sales, from the orders its terminals synced (BUG-041) - deliberately separate
   * from the platform's invoices to that restaurant. A sale is a paid, non-cancelled order. Amounts are
   * in rupees (orders are stored in paise). Defaults to the last 30 days.
   */
  async getRestaurantSales(restaurantId: string, range: { from?: string; to?: string } = {}) {
    const to = range.to ? new Date(range.to) : new Date();
    const from = range.from ? new Date(range.from) : new Date(to.getTime() - 30 * 86400_000);
    const inRange = Prisma.sql`o."restaurantId" = ${restaurantId} AND o."createdAt" >= ${ts(from)} AND o."createdAt" <= ${ts(to)}`;
    const isSale = Prisma.sql`o."paymentStatus" = 'SUCCESS' AND o.status NOT IN ('CANCELLED', 'VOID')`;
    const rupees = (n: unknown) => Math.round(Number(n ?? 0)) / 100;

    return this.prisma.runAsPlatform(async (tx) => {
      const restaurant = await tx.restaurant.findFirst({ where: { id: restaurantId, deletedAt: null }, select: { id: true, name: true } });
      if (!restaurant) throw new NotFoundException('Restaurant not found');

      const [totals, byDay, byMethod, byBranch, topItems, anyOrder] = await Promise.all([
        tx.$queryRaw<Array<{ orders: number; sales: number; open: number; cancelled: number }>>(Prisma.sql`
          SELECT COUNT(*) FILTER (WHERE ${isSale})::int AS orders,
                 COALESCE(SUM(o."totalAmount") FILTER (WHERE ${isSale}), 0)::float8 AS sales,
                 COUNT(*) FILTER (WHERE o."paymentStatus" IS DISTINCT FROM 'SUCCESS' AND o.status NOT IN ('CANCELLED', 'VOID'))::int AS open,
                 COUNT(*) FILTER (WHERE o.status IN ('CANCELLED', 'VOID'))::int AS cancelled
          FROM "SyncedOrder" o WHERE ${inRange}`),
        tx.$queryRaw<Array<{ date: Date; orders: number; sales: number }>>(Prisma.sql`
          SELECT (o."createdAt")::date AS date, COUNT(*)::int AS orders, SUM(o."totalAmount")::float8 AS sales
          FROM "SyncedOrder" o WHERE ${inRange} AND ${isSale} GROUP BY 1 ORDER BY 1 ASC`),
        tx.$queryRaw<Array<{ method: string; orders: number; sales: number }>>(Prisma.sql`
          SELECT COALESCE(o."paymentMethod", 'UNKNOWN') AS method, COUNT(*)::int AS orders, SUM(o."totalAmount")::float8 AS sales
          FROM "SyncedOrder" o WHERE ${inRange} AND ${isSale} GROUP BY 1 ORDER BY sales DESC`),
        tx.$queryRaw<Array<{ branchId: string | null; branchName: string; orders: number; sales: number }>>(Prisma.sql`
          SELECT o."branchId" AS "branchId", COALESCE(b.name, 'Unassigned') AS "branchName", COUNT(*)::int AS orders, SUM(o."totalAmount")::float8 AS sales
          FROM "SyncedOrder" o LEFT JOIN "Branch" b ON b.id = o."branchId"
          WHERE ${inRange} AND ${isSale} GROUP BY o."branchId", b.name ORDER BY sales DESC`),
        tx.$queryRaw<Array<{ name: string; quantity: number; revenue: number }>>(Prisma.sql`
          SELECT it->>'name' AS name, SUM((it->>'quantity')::numeric)::float8 AS quantity, SUM(COALESCE((it->>'lineTotal')::numeric, 0))::float8 AS revenue
          FROM "SyncedOrder" o, jsonb_array_elements(o.items) it
          WHERE ${inRange} AND ${isSale} AND it->>'name' IS NOT NULL GROUP BY 1 ORDER BY revenue DESC, quantity DESC LIMIT 10`),
        tx.syncedOrder.count({ where: { restaurantId } })
      ]);

      const t = totals[0] ?? { orders: 0, sales: 0, open: 0, cancelled: 0 };
      const sales = rupees(t.sales);
      return {
        source: 'RESTAURANT_SYNCED_ORDERS',
        note: "These are the restaurant's own sales, from orders its terminals synced. They are not the platform's invoices to the restaurant.",
        restaurant,
        period: { from: from.toISOString(), to: to.toISOString() },
        hasData: anyOrder > 0,
        totals: {
          orders: t.orders,
          sales,
          averageOrder: t.orders > 0 ? Math.round((sales / t.orders) * 100) / 100 : 0,
          openOrders: t.open,
          cancelledOrders: t.cancelled
        },
        byDay: byDay.map((d) => ({ date: new Date(d.date).toISOString().slice(0, 10), orders: d.orders, sales: rupees(d.sales) })),
        byPaymentMethod: byMethod.map((m) => ({ method: m.method, orders: m.orders, sales: rupees(m.sales) })),
        byBranch: byBranch.map((b) => ({ branchId: b.branchId, branchName: b.branchName, orders: b.orders, sales: rupees(b.sales) })),
        topItems: topItems.map((i) => ({ name: i.name, quantity: Number(i.quantity), revenue: rupees(i.revenue) }))
      };
    });
  }

  async getSummary() {
    const [
      totalRestaurants,
      activeRestaurants,
      suspendedRestaurants,
      totalBranches,
      totalDevices,
      activeDevices,
      totalSubscriptions,
      activeSubscriptions,
      invoiceTotals
    ] = await Promise.all([
      this.prisma.platformDb.restaurant.count({ where: { deletedAt: null } }),
      this.prisma.platformDb.restaurant.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.platformDb.restaurant.count({ where: { status: 'SUSPENDED', deletedAt: null } }),
      this.prisma.platformDb.branch.count({ where: { status: 'ACTIVE' } }),
      this.prisma.platformDb.device.count(),
      this.prisma.platformDb.device.count({ where: { status: 'ACTIVE' } }),
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
        active: activeDevices,
        offline: Math.max(0, totalDevices - activeDevices)
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

  async getRevenue() {
    const [invoices, totals] = await Promise.all([
      this.prisma.platformDb.invoice.findMany({ include: { plan: true, restaurant: true }, orderBy: { createdAt: 'desc' }, take: 10 }),
      this.prisma.runAsPlatform((tx) => tx.$queryRaw<Array<{ tier: string; revenue: number; count: number }>>(Prisma.sql`
        SELECT p.tier::text AS tier, SUM(i."totalAmount")::float8 AS revenue, COUNT(*)::int AS count
        FROM "Invoice" i JOIN "Plan" p ON p.id = i."planId" GROUP BY p.tier`))
    ]);
    const core = totals.find((t) => t.tier === 'CORE');
    const pro = totals.find((t) => t.tier === 'PRO');
    return {
      byPlan: [
        { tier: 'CORE', name: 'JAMANVAAR CORE', revenue: Math.round(Number(core?.revenue ?? 0) / 100), count: core?.count ?? 0 },
        { tier: 'PRO', name: 'JAMANVAAR PRO', revenue: Math.round(Number(pro?.revenue ?? 0) / 100), count: pro?.count ?? 0 }
      ],
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

  async getRestaurants() {
    const [restaurants, cities, total] = await Promise.all([
      this.prisma.platformDb.restaurant.findMany({ where: { deletedAt: null },
        include: { _count: { select: { branches: true, devices: true } }, subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
        orderBy: { createdAt: 'desc' }, take: 15 }),
      this.prisma.platformDb.restaurant.groupBy({ by: ['city'], where: { deletedAt: null }, _count: true }),
      this.prisma.platformDb.restaurant.count({ where: { deletedAt: null } })
    ]);
    const cityMap = new Map<string, number>();
    for (const c of cities) { const city = c.city || 'Unknown'; cityMap.set(city, (cityMap.get(city) ?? 0) + c._count); }
    const cityBreakdown = Array.from(cityMap, ([city, count]) => ({ city, count }));
    return {
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

  async getDevices() {
    const [devices, counts, total] = await Promise.all([
      this.prisma.platformDb.device.findMany({ include: { restaurant: true, branch: true }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.platformDb.device.groupBy({ by: ['type'], _count: true }),
      this.prisma.platformDb.device.count()
    ]);
    const typeCounts: Record<string, number> = { POS: 0, CAPTAIN: 0, KDS: 0, KIOSK: 0, POS_ADMIN: 0, KIOSK_ADMIN: 0 };
    for (const c of counts) typeCounts[c.type] = c._count;
    return {
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

  async getSubscriptions() {
    const [subscriptions, counts, total] = await Promise.all([
      this.prisma.platformDb.subscription.findMany({ include: { restaurant: true, plan: true }, orderBy: { createdAt: 'desc' }, take: 15 }),
      this.prisma.platformDb.subscription.groupBy({ by: ['status'], _count: true }),
      this.prisma.platformDb.subscription.count()
    ]);
    const statusCounts: Record<string, number> = { ACTIVE: 0, TRIAL: 0, PAST_DUE: 0, SUSPENDED: 0, EXPIRED: 0 };
    for (const c of counts) statusCounts[c.status] = c._count;
    return {
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
  async generateCsv(reportType: string): Promise<string> {
    if (reportType === 'revenue') {
      const invoices = await this.prisma.platformDb.invoice.findMany({
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
        where: { deletedAt: null },
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
    const subs = await this.prisma.platformDb.subscription.findMany({
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
