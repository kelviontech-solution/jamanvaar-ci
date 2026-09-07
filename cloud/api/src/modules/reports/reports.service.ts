import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

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
      this.prisma.restaurant.count({ where: { deletedAt: null } }),
      this.prisma.restaurant.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.restaurant.count({ where: { status: 'SUSPENDED', deletedAt: null } }),
      this.prisma.branch.count({ where: { status: 'ACTIVE' } }),
      this.prisma.device.count(),
      this.prisma.device.count({ where: { status: 'ACTIVE' } }),
      this.prisma.subscription.count(),
      this.prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      this.prisma.invoice.findMany({
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
    const activeSubsWithPlan = await this.prisma.subscription.findMany({
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
    const invoices = await this.prisma.invoice.findMany({
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
    const restaurants = await this.prisma.restaurant.findMany({
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
    const devices = await this.prisma.device.findMany({
      include: { restaurant: true, branch: true },
      orderBy: { createdAt: 'desc' }
    });

    const typeCounts: Record<string, number> = { POS: 0, CAPTAIN: 0, KDS: 0, KIOSK: 0, POS_ADMIN: 0 };
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
    const subscriptions = await this.prisma.subscription.findMany({
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
      const invoices = await this.prisma.invoice.findMany({
        include: { restaurant: true, plan: true }
      });
      const headers = ['Invoice Number', 'Restaurant', 'Plan', 'Subtotal (INR)', 'Tax Amount (INR)', 'Total (INR)', 'Status', 'Issued At'];
      const rows = invoices.map((i) => [
        i.invoiceNumber,
        `"${i.restaurant.name.replace(/"/g, '""')}"`,
        `"${i.plan?.name ?? 'Custom Plan'}"`,
        (i.amount / 100).toFixed(2),
        (i.taxAmount / 100).toFixed(2),
        (i.totalAmount / 100).toFixed(2),
        i.status,
        i.createdAt.toISOString()
      ]);
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    }

    if (reportType === 'restaurants') {
      const restaurants = await this.prisma.restaurant.findMany({
        where: { deletedAt: null },
        include: { branches: true, subscriptions: { include: { plan: true } } }
      });
      const headers = ['ID', 'Restaurant Name', 'City', 'State', 'Status', 'Branches', 'Plan', 'Created At'];
      const rows = restaurants.map((r) => [
        r.id,
        `"${r.name.replace(/"/g, '""')}"`,
        r.city ?? '',
        r.state ?? '',
        r.status,
        r.branches.length,
        `"${r.subscriptions[0]?.plan.name ?? 'None'}"`,
        r.createdAt.toISOString()
      ]);
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    }

    // Default subscriptions CSV
    const subs = await this.prisma.subscription.findMany({
      include: { restaurant: true, plan: true }
    });
    const headers = ['ID', 'Restaurant', 'Plan Tier', 'Price Monthly', 'Status', 'Start Date', 'Expires At'];
    const rows = subs.map((s) => [
      s.id,
      `"${s.restaurant.name.replace(/"/g, '""')}"`,
      s.plan.tier,
      (s.plan.priceMonthly / 100).toFixed(2),
      s.status,
      s.startDate.toISOString(),
      s.expiresAt.toISOString()
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
