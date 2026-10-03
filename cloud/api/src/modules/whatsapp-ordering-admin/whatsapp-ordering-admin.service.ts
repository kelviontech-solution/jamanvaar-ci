import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplicationEntitlementsService } from '../application-entitlements/application-entitlements.service';

const WHATSAPP_APP_CODE = 'WHATSAPP_ORDERING' as const;

export interface WhatsAppOrderingRestaurantItem {
  restaurantId: string;
  restaurantName: string;
  connectionStatus: 'PENDING' | 'CONNECTED' | 'REVOKED';
  keyPrefix: string;
  autoAccept: boolean;
  paused: boolean;
  connectedAt: string | null;
  lastUsedAt: string | null;
  entitlementEnabled: boolean;
  entitlementReason: string;
  ordersTotal: number;
  revenueTotalPaise: number;
  lastOrderAt: string | null;
}

export interface PlatformWhatsAppOrderingMetrics {
  connectedRestaurants: number;
  pendingRestaurants: number;
  totalOrders: number;
  totalRevenuePaise: number;
}

/**
 * Super Admin's read-only visibility into the WhatsApp connector — Phase 6 of
 * docs/integrations/JAMANVAAR_WHATSAPP_CONNECTOR_IMPLEMENTATION_PLAN.md. Deliberately
 * smaller than QrOrderingService: unlike QR (where every restaurant's entitlement is worth
 * showing regardless of whether they've touched it), this connector is pilot-stage and the
 * useful question is narrower — which restaurants actually have a connection, and is it
 * healthy — so this only lists restaurants with a real WhatsAppChannelConnection row, not
 * every restaurant on the platform. Entitlement *toggling* deliberately reuses the existing
 * generic Applications tab (SubscriptionApplicationsController) rather than a parallel
 * WhatsApp-specific override endpoint — WHATSAPP_ORDERING is an ordinary AppCode now, not a
 * special case that needs its own mutation surface.
 */
@Injectable()
export class WhatsAppOrderingAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: ApplicationEntitlementsService
  ) {}

  async listRestaurants(): Promise<WhatsAppOrderingRestaurantItem[]> {
    const connections = await this.prisma.runAsPlatform((tx) =>
      tx.whatsAppChannelConnection.findMany({
        include: { restaurant: { select: { id: true, name: true, deletedAt: true } } },
        orderBy: { connectedAt: 'desc' }
      })
    );

    const out: WhatsAppOrderingRestaurantItem[] = [];
    for (const conn of connections) {
      if (!conn.restaurant || conn.restaurant.deletedAt) continue;
      const restaurantId = conn.restaurant.id;

      const [entitlement, agg] = await Promise.all([
        this.prisma.runAsPlatform((tx) => this.entitlements.resolve(tx, restaurantId, WHATSAPP_APP_CODE)),
        this.prisma.runAsTenant(restaurantId, (tx) =>
          tx.paymentTransaction.aggregate({
            where: { restaurantId, status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'] }, order: { source: 'WHATSAPP' } },
            _sum: { amount: true },
            _count: true,
            _max: { paidAt: true }
          })
        )
      ]);

      out.push({
        restaurantId,
        restaurantName: conn.restaurant.name,
        connectionStatus: conn.status,
        keyPrefix: conn.keyPrefix,
        autoAccept: conn.autoAccept,
        paused: conn.pausedAt !== null,
        connectedAt: conn.connectedAt?.toISOString() ?? null,
        lastUsedAt: conn.lastUsedAt?.toISOString() ?? null,
        entitlementEnabled: entitlement.enabled,
        entitlementReason: entitlement.reason,
        ordersTotal: agg._count,
        revenueTotalPaise: agg._sum.amount ?? 0,
        lastOrderAt: agg._max.paidAt?.toISOString() ?? null
      });
    }
    return out;
  }

  async getMetrics(): Promise<PlatformWhatsAppOrderingMetrics> {
    const list = await this.listRestaurants();
    return {
      connectedRestaurants: list.filter((r) => r.connectionStatus === 'CONNECTED').length,
      pendingRestaurants: list.filter((r) => r.connectionStatus === 'PENDING').length,
      totalOrders: list.reduce((s, r) => s + r.ordersTotal, 0),
      totalRevenuePaise: list.reduce((s, r) => s + r.revenueTotalPaise, 0)
    };
  }
}
