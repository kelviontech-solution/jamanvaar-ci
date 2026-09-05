import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    return this.prisma.runAsPlatform(async (tx) => {
      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [
        totalRestaurants,
        activeRestaurants,
        suspendedRestaurants,
        totalBranches,
        activeSubscriptions,
        trialSubscriptions,
        expiringSubscriptions,
        registeredDevices,
        onlineDevices,
        newRestaurantsThisMonth,
        recentActivity,
        activeSubsWithPlan,
        planCounts
      ] = await Promise.all([
        tx.restaurant.count({ where: { deletedAt: null } }),
        tx.restaurant.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
        tx.restaurant.count({ where: { deletedAt: null, status: 'SUSPENDED' } }),
        tx.branch.count(),
        tx.subscription.count({ where: { status: 'ACTIVE' } }),
        tx.subscription.count({ where: { status: 'TRIAL' } }),
        tx.subscription.count({
          where: { status: 'ACTIVE', expiresAt: { lte: thirtyDaysFromNow } }
        }),
        tx.device.count(),
        tx.device.count({ where: { status: 'ACTIVE' } }),
        tx.restaurant.count({ where: { deletedAt: null, createdAt: { gte: startOfMonth } } }),
        tx.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 15 }),
        // MRR/ARR: real sums over actually-active subscriptions × their plan's real price — no synthetic revenue.
        tx.subscription.findMany({
          where: { status: 'ACTIVE' },
          select: { plan: { select: { priceMonthly: true } } }
        }),
        tx.subscription.groupBy({
          by: ['planId'],
          where: { status: { in: ['ACTIVE', 'TRIAL'] } },
          _count: { _all: true }
        })
      ]);

      const mrrPaise = activeSubsWithPlan.reduce((sum, s) => sum + s.plan.priceMonthly, 0);

      const plans = planCounts.length
        ? await tx.plan.findMany({ where: { id: { in: planCounts.map((p) => p.planId) } } })
        : [];
      const planDistribution = planCounts.map((pc) => ({
        planId: pc.planId,
        planName: plans.find((p) => p.id === pc.planId)?.name ?? 'Unknown plan',
        subscriptionCount: pc._count._all
      }));

      return {
        totalRestaurants,
        activeRestaurants,
        suspendedRestaurants,
        totalBranches,
        activeSubscriptions,
        trialSubscriptions,
        expiringSubscriptions,
        registeredDevices,
        onlineDevices,
        newRestaurantsThisMonth,
        mrr: mrrPaise / 100,
        arr: (mrrPaise * 12) / 100,
        planDistribution,
        recentActivity
      };
    });
  }
}
