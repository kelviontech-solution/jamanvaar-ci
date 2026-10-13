import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ONLINE_WITHIN_MS } from '../../common/device-health';
import { computeHealthScore, type HealthResult, type HealthSignals } from './health-score.util';

export interface RestaurantHealthRow extends HealthResult {
  restaurantId: string;
  name: string;
  city: string | null;
}

/**
 * Super Admin feature request: "churn/risk radar" + "restaurant health score". Every signal here
 * already exists on another page (Devices, Subscriptions, Payment Gateways, Support Tickets, Sync
 * Monitor) -- this module only aggregates them into one sortable board so an operator does not have
 * to click into every restaurant to notice trouble. computeHealthScore stays pure/DB-free so the
 * scoring logic is unit-tested without touching the database; this service's job is only getting
 * the right numbers into it.
 */
@Injectable()
export class RestaurantHealthService {
  constructor(private readonly prisma: PrismaService) {}

  async getBoard(): Promise<{ restaurants: RestaurantHealthRow[]; summary: { healthy: number; watch: number; atRisk: number } }> {
    return this.prisma.runAsPlatform(async (tx) => {
      const restaurants = await tx.restaurant.findMany({
        where: { deletedAt: null, status: { not: 'ARCHIVED' } },
        select: { id: true, name: true, city: true }
      });
      const restaurantIds = restaurants.map((r) => r.id);
      if (restaurantIds.length === 0) return { restaurants: [], summary: { healthy: 0, watch: 0, atRisk: 0 } };

      const now = new Date();
      const onlineSince = new Date(now.getTime() - ONLINE_WITHIN_MS);

      const [subscriptions, connections, devices, openTickets, conflicts] = await Promise.all([
        tx.subscription.findMany({
          where: { restaurantId: { in: restaurantIds }, status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] } },
          select: { restaurantId: true, status: true },
          orderBy: { createdAt: 'desc' }
        }),
        tx.restaurantPaymentConnection.findMany({
          where: { restaurantId: { in: restaurantIds } },
          select: { restaurantId: true, bankVerificationStatus: true }
        }),
        tx.device.findMany({
          where: { restaurantId: { in: restaurantIds }, status: 'ACTIVE' },
          select: { restaurantId: true, lastSeenAt: true }
        }),
        tx.supportTicket.groupBy({
          by: ['restaurantId'],
          where: { restaurantId: { in: restaurantIds }, status: { in: ['OPEN', 'IN_PROGRESS'] } },
          _count: { _all: true }
        }),
        tx.syncConflict.groupBy({
          by: ['restaurantId'],
          where: { restaurantId: { in: restaurantIds }, resolution: 'PENDING' },
          _count: { _all: true }
        })
      ]);

      const subByRestaurant = new Map<string, string>();
      for (const s of subscriptions) if (!subByRestaurant.has(s.restaurantId)) subByRestaurant.set(s.restaurantId, s.status);
      const bankByRestaurant = new Map(connections.map((c) => [c.restaurantId, c.bankVerificationStatus] as const));
      const deviceCounts = new Map<string, { total: number; unhealthy: number }>();
      for (const d of devices) {
        const bucket = deviceCounts.get(d.restaurantId) ?? { total: 0, unhealthy: 0 };
        bucket.total += 1;
        if (!d.lastSeenAt || d.lastSeenAt < onlineSince) bucket.unhealthy += 1;
        deviceCounts.set(d.restaurantId, bucket);
      }
      const ticketsByRestaurant = new Map(openTickets.map((t) => [t.restaurantId as string, t._count._all]));
      const conflictsByRestaurant = new Map(conflicts.map((c) => [c.restaurantId, c._count._all]));

      const rows: RestaurantHealthRow[] = restaurants.map((r) => {
        const devices = deviceCounts.get(r.id) ?? { total: 0, unhealthy: 0 };
        const signals: HealthSignals = {
          subscriptionStatus: (subByRestaurant.get(r.id) as HealthSignals['subscriptionStatus']) ?? null,
          bankVerificationStatus: (bankByRestaurant.get(r.id) as HealthSignals['bankVerificationStatus']) ?? null,
          activeDeviceCount: devices.total,
          unhealthyDeviceCount: devices.unhealthy,
          openSupportTickets: ticketsByRestaurant.get(r.id) ?? 0,
          pendingSyncConflicts: conflictsByRestaurant.get(r.id) ?? 0
        };
        const result = computeHealthScore(signals);
        return { restaurantId: r.id, name: r.name, city: r.city, ...result };
      });

      rows.sort((a, b) => a.score - b.score);
      const summary = rows.reduce(
        (acc, r) => {
          if (r.tone === 'healthy') acc.healthy += 1;
          else if (r.tone === 'watch') acc.watch += 1;
          else acc.atRisk += 1;
          return acc;
        },
        { healthy: 0, watch: 0, atRisk: 0 }
      );
      return { restaurants: rows, summary };
    });
  }
}
