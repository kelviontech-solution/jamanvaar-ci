import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ts } from '../../common/sql';
import { escapeCsvField } from '../../common/security/csv.util';

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
      invoices
    ] = await Promise.all([
      this.prisma.platformDb.restaurant.count({ where: { deletedAt: null } }),
      this.prisma.platformDb.restaurant.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.platformDb.restaurant.count({ where: { status: 'SUSPENDED', deletedAt: null } }),
      this.prisma.platformDb.branch.count({ where: { status: 'ACTIVE' } }),
      this.prisma.platformDb.device.count(),
      this.prisma.platformDb.device.count({ where: { status: 'ACTIVE' } }),
      this.prisma.platformDb.subscription.count(),
      this.prisma.platformDb.subscription.count({ where: { status: 'ACTIVE' } }),
      this.prisma.platformDb.invoice.findMany({
        where: { status: { not: 'VOID' } },
        select: { totalAmount: true, status: true }
      })
    ]);

    // Financial reconciliation
    const collectedPaise = invoices
      .filter((inv) => inv.status === 'PAID')
      .reduce((sum, inv) => sum + inv.totalAmount, 0);
    const outstandingPaise = invoices
      .filter((inv) => inv.status === 'ISSUED' || inv.status === 'PAST_DUE' || inv.status === 'DRAFT')
      .reduce((sum, inv) => sum + inv.totalAmount, 0);

    // MRR calculation based on active subscriptions
    const activeSubsWithPlan = await this.prisma.platformDb.subscription.findMany({
      where: { status: 'ACTIVE' },
      include: { plan: true }
    });
    const mrrPaise = activeSubsWithPlan.reduce((sum, sub) => sum + sub.plan.priceMonthly, 0);
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
    const invoices = await this.prisma.platformDb.invoice.findMany({
      include: { plan: true, restaurant: true },
      orderBy: { createdAt: 'desc' }
    });

    const coreInvoices = invoices.filter((i) => i.plan?.tier === 'CORE');
    const proInvoices = invoices.filter((i) => i.plan?.tier === 'PRO');

    const coreRevenue = coreInvoices.reduce((sum, i) => sum + i.totalAmount, 0);
    const proRevenue = proInvoices.reduce((sum, i) => sum + i.totalAmount, 0);

    return {
      byPlan: [
        { tier: 'CORE', name: 'JAMANVAAR CORE', revenue: Math.round(coreRevenue / 100), count: coreInvoices.length },
        { tier: 'PRO', name: 'JAMANVAAR PRO', revenue: Math.round(proRevenue / 100), count: proInvoices.length }
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
    const restaurants = await this.prisma.platformDb.restaurant.findMany({
      where: { deletedAt: null },
      include: {
        branches: true,
        subscriptions: { include: { plan: true } },
        devices: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const cityMap: Record<string, number> = {};
    for (const r of restaurants) {
      const city = r.city || 'Unknown';
      cityMap[city] = (cityMap[city] || 0) + 1;
    }

    const cityBreakdown = Object.entries(cityMap).map(([city, count]) => ({ city, count }));

    return {
      total: restaurants.length,
      cityBreakdown,
      list: restaurants.slice(0, 15).map((r) => ({
        id: r.id,
        name: r.name,
        city: r.city,
        status: r.status,
        branchCount: r.branches.length,
        deviceCount: r.devices.length,
        activePlan: r.subscriptions[0]?.plan.name ?? 'No Plan',
        createdAt: r.createdAt.toISOString()
      }))
    };
  }

  async getDevices() {
    const devices = await this.prisma.platformDb.device.findMany({
      include: { restaurant: true, branch: true },
      orderBy: { createdAt: 'desc' }
    });

    const typeCounts: Record<string, number> = { POS: 0, CAPTAIN: 0, KDS: 0, KIOSK: 0, POS_ADMIN: 0, KIOSK_ADMIN: 0 };
    for (const d of devices) {
      if (typeCounts[d.type] !== undefined) {
        typeCounts[d.type]++;
      }
    }

    return {
      total: devices.length,
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
    const subscriptions = await this.prisma.platformDb.subscription.findMany({
      include: { restaurant: true, plan: true },
      orderBy: { createdAt: 'desc' }
    });

    const statusCounts: Record<string, number> = { ACTIVE: 0, TRIAL: 0, PAST_DUE: 0, SUSPENDED: 0, EXPIRED: 0 };
    for (const s of subscriptions) {
      statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
    }

    return {
      total: subscriptions.length,
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
        escapeCsvField(i.invoiceNumber),
        escapeCsvField(i.restaurant.name),
        escapeCsvField(i.plan?.name ?? 'Custom Plan'),
        escapeCsvField((i.amount / 100).toFixed(2)),
        escapeCsvField((i.taxAmount / 100).toFixed(2)),
        escapeCsvField((i.totalAmount / 100).toFixed(2)),
        escapeCsvField(i.status),
        escapeCsvField(i.createdAt.toISOString())
      ]);
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    }

    if (reportType === 'restaurants') {
      const restaurants = await this.prisma.platformDb.restaurant.findMany({
        where: { deletedAt: null },
        include: { branches: true, subscriptions: { include: { plan: true } } }
      });
      const headers = ['ID', 'Restaurant Name', 'City', 'State', 'Status', 'Branches', 'Plan', 'Created At'];
      const rows = restaurants.map((r) => [
        escapeCsvField(r.id),
        escapeCsvField(r.name),
        escapeCsvField(r.city ?? ''),
        escapeCsvField(r.state ?? ''),
        escapeCsvField(r.status),
        escapeCsvField(r.branches.length),
        escapeCsvField(r.subscriptions[0]?.plan.name ?? 'None'),
        escapeCsvField(r.createdAt.toISOString())
      ]);
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    }

    // Default subscriptions CSV
    const subs = await this.prisma.platformDb.subscription.findMany({
      include: { restaurant: true, plan: true }
    });
    const headers = ['ID', 'Restaurant', 'Plan Tier', 'Price Monthly', 'Status', 'Start Date', 'Expires At'];
    const rows = subs.map((s) => [
      escapeCsvField(s.id),
      escapeCsvField(s.restaurant.name),
      escapeCsvField(s.plan.tier),
      escapeCsvField((s.plan.priceMonthly / 100).toFixed(2)),
      escapeCsvField(s.status),
      escapeCsvField(s.startDate.toISOString()),
      escapeCsvField(s.expiresAt.toISOString())
    ]);
    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
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
      const offlineDevices = devicesCount - activeDevices;

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
