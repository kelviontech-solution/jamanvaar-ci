import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AppCode, PlanTier, PlatformUser, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdateApplicationEntitlementDto } from './dto/application-entitlement.dto';

type TxClient = Prisma.TransactionClient;

export const ALL_APP_CODES: AppCode[] = ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN'];

/**
 * Which applications each plan tier includes by default. This is the one
 * place that decision lives — everything else (onboarding, plan-change,
 * activation-key gating) calls into this service rather than re-encoding
 * "does this tier include Kiosk" itself.
 *
 * Matches the tier split already established in Plan.entitlements (seed.ts):
 * CORE is the counter/back-office basics, PRO adds the wireless/self-service
 * tier (Captain, Kiosk, Kiosk Admin). ENTERPRISE is treated as a superset of
 * PRO — the same convention already used everywhere in super-admin-web
 * (`tier === 'PRO' || tier === 'ENTERPRISE'`).
 */
export const DEFAULT_APPS_BY_TIER: Record<PlanTier, AppCode[]> = {
  CORE: ['POS', 'POS_ADMIN', 'KDS'],
  PRO: ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN'],
  ENTERPRISE: ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN']
};

@Injectable()
export class ApplicationEntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  /**
   * Creates (or resyncs) one row per AppCode for a subscription — always all
   * six, dense, never sparse — so "no row" is never an ambiguous state a
   * caller has to guess about. `enabledApps` overrides the tier defaults
   * when the caller (onboarding wizard, or a plan change) knows exactly
   * which apps should be on; omit it to just apply the tier defaults.
   *
   * Idempotent: re-running this (e.g. on plan change) resets `enabled` to
   * match the given set but leaves an existing row's `deviceQuota`/`config`
   * untouched, so a restaurant-specific override (e.g. "only 2 Kiosk
   * devices") survives a plan change instead of being silently wiped.
   */
  async ensureRowsForSubscription(
    tx: TxClient,
    restaurantId: string,
    subscriptionId: string,
    tier: PlanTier,
    enabledApps?: AppCode[]
  ): Promise<void> {
    const enabled = new Set(enabledApps ?? DEFAULT_APPS_BY_TIER[tier]);

    await Promise.all(
      ALL_APP_CODES.map((appCode) =>
        tx.applicationEntitlement.upsert({
          where: { subscriptionId_appCode: { subscriptionId, appCode } },
          create: { restaurantId, subscriptionId, appCode, enabled: enabled.has(appCode) },
          update: { enabled: enabled.has(appCode) }
        })
      )
    );
  }

  async listForSubscription(subscriptionId: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const sub = await tx.subscription.findUnique({ where: { id: subscriptionId } });
      if (!sub) throw new NotFoundException('Subscription not found');
      return tx.applicationEntitlement.findMany({
        where: { subscriptionId },
        orderBy: { appCode: 'asc' }
      });
    });
  }

  async listForRestaurant(restaurantId: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const sub = await tx.subscription.findFirst({
        where: { restaurantId, status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] } },
        orderBy: { createdAt: 'desc' }
      });
      if (!sub) return [];
      return tx.applicationEntitlement.findMany({
        where: { subscriptionId: sub.id },
        orderBy: { appCode: 'asc' }
      });
    });
  }

  async update(subscriptionId: string, appCode: AppCode, dto: UpdateApplicationEntitlementDto, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.applicationEntitlement.findUnique({
        where: { subscriptionId_appCode: { subscriptionId, appCode } }
      });
      if (!existing) throw new NotFoundException(`No ${appCode} entitlement row for this subscription`);

      const updated = await tx.applicationEntitlement.update({
        where: { subscriptionId_appCode: { subscriptionId, appCode } },
        data: {
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
          ...(dto.deviceQuota !== undefined ? { deviceQuota: dto.deviceQuota } : {}),
          ...(dto.config !== undefined
            ? { config: dto.config === null ? Prisma.JsonNull : (dto.config as Prisma.InputJsonValue) }
            : {})
        }
      });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: existing.restaurantId,
          action: 'APPLICATION_ENTITLEMENT_UPDATED',
          category: 'APPLICATIONS',
          details: { subscriptionId, appCode, changes: dto }
        },
        tx
      );

      return updated;
    });
  }

  /**
   * The actual enforcement point: is `appCode` usable right now for this
   * restaurant? Fails closed — no subscription, no row, or an explicitly
   * disabled row all mean "no", the same way an unset RLS context denies
   * every row rather than defaulting to visible.
   *
   * Phase 2: a restaurant may hold more than one active subscription at once (one per
   * product family — see SubscriptionsService.assign), so this checks every active/trial/
   * past-due subscription and returns true if ANY of them grants the app, not just whichever
   * was created most recently.
   */
  async isAppEnabled(tx: TxClient, restaurantId: string, appCode: AppCode): Promise<boolean> {
    const subs = await tx.subscription.findMany({
      where: { restaurantId, status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] } },
      select: { id: true }
    });
    if (subs.length === 0) return false;

    const row = await tx.applicationEntitlement.findFirst({
      where: { subscriptionId: { in: subs.map((s) => s.id) }, appCode, enabled: true }
    });
    return row !== null;
  }

  /** Throws a clear 403 instead of a bare boolean when the caller wants to fail the request outright. */
  async assertAppEnabled(tx: TxClient, restaurantId: string, appCode: AppCode): Promise<void> {
    const ok = await this.isAppEnabled(tx, restaurantId, appCode);
    if (!ok) {
      throw new ForbiddenException(
        `${appCode} is not enabled on this restaurant's current subscription. Enable it under Applications before provisioning a device.`
      );
    }
  }
}
