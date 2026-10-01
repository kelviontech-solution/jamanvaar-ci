import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AppCode, DeviceType, PlanTier, PlatformUser, Prisma, ProductFamily } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdateApplicationEntitlementDto } from './dto/application-entitlement.dto';
import { getDependentsOf } from './feature-catalog';

type TxClient = Prisma.TransactionClient;

export const ALL_APP_CODES: AppCode[] = ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN', 'QR_ORDERING', 'WHATSAPP_ORDERING'];

/**
 * Every AppCode with a real corresponding DeviceType a restaurant can actually provision —
 * QR_ORDERING and WHATSAPP_ORDERING are channel entitlements, not a device someone activates
 * (a QR guest's browser and a WhatsApp customer's chat are never a `Device` row), so
 * `DeviceType` has no member for either. Checked below before ever casting an AppCode into a
 * `DeviceType`-typed query — found live (not by inspection): Prisma's client-side validation
 * throws `Invalid value for argument type. Expected DeviceType.` for a bare `type:
 * appCode as unknown as DeviceType` device-count query on either code, an unhandled exception
 * surfacing as a 500 instead of the intended "0 devices affected" answer.
 */
const DEVICE_BACKED_APP_CODES = new Set<AppCode>(['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN']);

/**
 * Which applications each (product family, plan tier) pair includes by default. Phase 2 let a
 * restaurant hold a RESTAURANT-family subscription and a KIOSK-family one concurrently, and the
 * same tier name (CORE, PRO) now means different apps in each family — a single
 * Record<PlanTier, AppCode[]> can no longer express that, so this is keyed on both.
 * ENTERPRISE (in either family) is treated as a superset default until a real custom-plan
 * mechanism exists (spec section 37) — Super Admin can already override per-subscription via
 * the `applications` param regardless.
 */
export type EntitlementReason = 'OK' | 'RESTAURANT_INACTIVE' | 'NO_SUBSCRIPTION' | 'SUBSCRIPTION_EXPIRED' | 'NOT_INCLUDED' | 'DISABLED';

export interface ResolvedEntitlement {
  appCode: AppCode;
  enabled: boolean;
  reason: EntitlementReason;
  /** PLAN: follows the plan's features. MANUAL_OVERRIDE: a Super Admin switched it for this restaurant only. */
  source: 'PLAN' | 'MANUAL_OVERRIDE' | null;
  limits: Record<string, unknown>;
  validUntil: string | null;
  planName: string | null;
}

export type FamilyTierKey = `${ProductFamily}:${PlanTier}`;
export const DEFAULT_APPS_BY_FAMILY_TIER: Partial<Record<FamilyTierKey, AppCode[]>> = {
  'RESTAURANT:CORE': ['POS', 'POS_ADMIN'],
  'RESTAURANT:PRO': ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS'],
  'RESTAURANT:QR': ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'QR_ORDERING'],
  'RESTAURANT:ENTERPRISE': ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'QR_ORDERING', 'WHATSAPP_ORDERING'],
  'KIOSK:CORE': ['KIOSK', 'KIOSK_ADMIN'],
  'KIOSK:PRO': ['KIOSK', 'KIOSK_ADMIN'],
  'KIOSK:ENTERPRISE': ['KIOSK', 'KIOSK_ADMIN']
};

export function defaultAppsFor(productFamily: ProductFamily, tier: PlanTier): AppCode[] {
  return DEFAULT_APPS_BY_FAMILY_TIER[`${productFamily}:${tier}`] ?? [];
}

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
    productFamily: ProductFamily,
    tier: PlanTier,
    enabledApps?: AppCode[],
    planEntitlements?: unknown
  ): Promise<void> {
    const enabled = new Set(enabledApps ?? (await this.appsForPlan(tx, productFamily, tier, planEntitlements)));

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

  /**
   * The apps a plan includes. The (family, tier) table still gives each tier its long-standing bundle, and a plan
   * that lists a feature as included ADDS that application to it (the Feature catalog says which flag key grants
   * which application). QR ordering and WhatsApp ordering are the exception by design: each is granted only by the
   * plan's own feature flag, never by a tier's name, so whether a restaurant has either is a fact about its plan's
   * feature list and about nothing else (not its name, tier or price).
   */
  async appsForPlan(tx: TxClient, productFamily: ProductFamily, tier: PlanTier, planEntitlements?: unknown): Promise<AppCode[]> {
    const apps = new Set<AppCode>(defaultAppsFor(productFamily, tier).filter((a) => a !== 'QR_ORDERING' && a !== 'WHATSAPP_ORDERING'));
    const flags = planEntitlements && typeof planEntitlements === 'object' && !Array.isArray(planEntitlements) ? (planEntitlements as Record<string, unknown>) : {};
    const bridged = await tx.feature.findMany({
      where: { isActive: true, appCode: { not: null }, legacyEntitlementKey: { not: null } },
      select: { appCode: true, legacyEntitlementKey: true }
    });
    for (const f of bridged) {
      if (f.appCode && flags[f.legacyEntitlementKey as string] === true) apps.add(f.appCode);
    }
    if (apps.has('KIOSK')) apps.add('KIOSK_ADMIN');
    return [...apps];
  }

  /**
   * THE entitlement question, answered in one place: is `appCode` usable for this restaurant right now, why or
   * why not, where does the answer come from, and what limits apply. Frontends display this result; backends
   * authorize with it; the Branch Core receives it in its roster. Nothing outside this method compares a plan name,
   * tier or price. Fails closed.
   */
  async resolve(tx: TxClient, restaurantId: string, appCode: AppCode): Promise<ResolvedEntitlement> {
    const closed = (reason: EntitlementReason, extra: Partial<ResolvedEntitlement> = {}): ResolvedEntitlement => ({
      appCode, enabled: false, reason, source: null, limits: {}, validUntil: null, planName: null, ...extra
    });

    const restaurant = await tx.restaurant.findFirst({ where: { id: restaurantId, deletedAt: null }, select: { status: true } });
    if (!restaurant || restaurant.status !== 'ACTIVE') return closed('RESTAURANT_INACTIVE');

    const now = new Date();
    const subs = await tx.subscription.findMany({
      where: { restaurantId, status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] } },
      include: { plan: { select: { name: true, tier: true, productFamily: true, entitlements: true } } },
      orderBy: { createdAt: 'desc' }
    });
    if (subs.length === 0) return closed('NO_SUBSCRIPTION');
    const current = subs.filter((s) => !s.expiresAt || s.expiresAt > now);
    if (current.length === 0) return closed('SUBSCRIPTION_EXPIRED', { validUntil: subs[0].expiresAt?.toISOString() ?? null, planName: subs[0].plan.name });

    const rows = await tx.applicationEntitlement.findMany({ where: { subscriptionId: { in: current.map((s) => s.id) }, appCode } });
    const granting = rows.find((r) => r.enabled);
    const owning = current.find((s) => s.id === (granting ?? rows[0])?.subscriptionId) ?? current[0];
    const planFlags = owning.plan.entitlements && typeof owning.plan.entitlements === 'object' && !Array.isArray(owning.plan.entitlements) ? (owning.plan.entitlements as Record<string, unknown>) : {};
    const rowConfig = granting?.config && typeof granting.config === 'object' && !Array.isArray(granting.config) ? (granting.config as Record<string, unknown>) : {};
    const planDefault = (await this.appsForPlan(tx, owning.plan.productFamily, owning.plan.tier, owning.plan.entitlements)).includes(appCode);

    if (!granting) {
      return closed(rows.length > 0 && planDefault ? 'DISABLED' : 'NOT_INCLUDED', { planName: owning.plan.name, validUntil: owning.expiresAt?.toISOString() ?? null });
    }
    return {
      appCode,
      enabled: true,
      reason: 'OK',
      source: granting.enabled === planDefault ? 'PLAN' : 'MANUAL_OVERRIDE',
      // The subscription's own row (a per-restaurant override) wins over the plan's default limits.
      limits: { ...planFlags, ...rowConfig },
      validUntil: owning.expiresAt?.toISOString() ?? null,
      planName: owning.plan.name
    };
  }

  private withSource<T extends { appCode: AppCode; enabled: boolean }>(
    rows: T[],
    plan: { tier: PlanTier; productFamily: ProductFamily }
  ): (T & { source: 'PLAN' | 'MANUAL_OVERRIDE' })[] {
    const defaults = new Set(defaultAppsFor(plan.productFamily, plan.tier));
    return rows.map((row) => ({
      ...row,
      source: row.enabled === defaults.has(row.appCode) ? ('PLAN' as const) : ('MANUAL_OVERRIDE' as const)
    }));
  }

  async listForSubscription(subscriptionId: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const sub = await tx.subscription.findUnique({
        where: { id: subscriptionId },
        include: { plan: { select: { tier: true, productFamily: true } } }
      });
      if (!sub) throw new NotFoundException('Subscription not found');
      const rows = await tx.applicationEntitlement.findMany({
        where: { subscriptionId },
        orderBy: { appCode: 'asc' }
      });
      return this.withSource(rows, sub.plan);
    });
  }

  /** Every active subscription's applications, merged: an application is enabled when ANY active subscription enables it. */
  async listForRestaurant(restaurantId: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const subs = await tx.subscription.findMany({
        where: { restaurantId, status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] } },
        orderBy: { createdAt: 'desc' },
        include: { plan: { select: { tier: true, productFamily: true, entitlements: true } } }
      });
      if (subs.length === 0) return [];
      const merged = new Map<string, Record<string, unknown> & { appCode: AppCode; enabled: boolean }>();
      for (const sub of subs) {
        const rows = await tx.applicationEntitlement.findMany({ where: { subscriptionId: sub.id }, orderBy: { appCode: 'asc' } });
        const defaults = new Set(await this.appsForPlan(tx, sub.plan.productFamily, sub.plan.tier, sub.plan.entitlements));
        for (const row of rows) {
          const withSource = { ...row, source: row.enabled === defaults.has(row.appCode) ? ('PLAN' as const) : ('MANUAL_OVERRIDE' as const) };
          const prior = merged.get(row.appCode);
          // An enabled row from any subscription wins; otherwise keep the newest subscription's row.
          if (!prior || (!prior.enabled && row.enabled)) merged.set(row.appCode, withSource as never);
        }
      }
      return [...merged.values()].sort((a, b) => a.appCode.localeCompare(b.appCode));
    });
  }

  async update(subscriptionId: string, appCode: AppCode, dto: UpdateApplicationEntitlementDto, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.applicationEntitlement.findUnique({
        where: { subscriptionId_appCode: { subscriptionId, appCode } }
      });
      if (!existing) throw new NotFoundException(`No ${appCode} entitlement row for this subscription`);

      if (dto.enabled === false && existing.enabled) {
        const enabledRows = await tx.applicationEntitlement.findMany({
          where: { subscriptionId, enabled: true }
        });
        const dependents = await getDependentsOf(tx, appCode,enabledRows.map((row) => row.appCode));
        if (dependents.length > 0) {
          throw new ConflictException(
            `${appCode} is required by ${dependents.length} enabled feature${dependents.length === 1 ? '' : 's'} (${dependents.join(', ')}). Disable ${dependents.length === 1 ? 'it' : 'them'} first.`
          );
        }
      }

      if (dto.enabled === false && existing.enabled && !dto.acknowledgeDeviceImpact && DEVICE_BACKED_APP_CODES.has(appCode)) {
        const activeDevices = await tx.device.count({
          where: { restaurantId: existing.restaurantId, type: appCode as unknown as DeviceType, status: { not: 'REVOKED' } }
        });
        if (activeDevices > 0) {
          throw new ConflictException(
            `${activeDevices} active ${appCode} device${activeDevices === 1 ? '' : 's'} will stop working if this app is disabled. Resend with acknowledgeDeviceImpact: true to confirm.`
          );
        }
      }

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
          details: { subscriptionId, appCode, changes: { ...dto, acknowledgeDeviceImpact: undefined } }
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

  /**
   * The real per-app device cap: how many `appCode` devices this restaurant may have active,
   * right now. Resolves to whichever active subscription's entitlement row grants `appCode`
   * (isAppEnabled's aggregation — normally exactly one), using that row's own deviceQuota
   * override if set, falling back to *that row's own subscription's* plan.maxDevices — never
   * some other active subscription's plan, even if the restaurant holds several (spec section
   * 38: quotas are per-app, not one global pool shared across every subscription).
   * A no-op (never throws) when there's no active subscription or no granting entitlement row
   * — assertAppEnabled is the gate for that; this only caps an app that's already allowed.
   */
  async assertDeviceQuotaAvailable(tx: TxClient, restaurantId: string, appCode: AppCode): Promise<void> {
    // QR_ORDERING/WHATSAPP_ORDERING are never an activated Device's own type (see
    // DEVICE_BACKED_APP_CODES above) — in practice this method is only ever called with a
    // real device type (activation-key redemption), but guarded defensively so a future
    // caller can't hit the same DeviceType cast crash this fixed elsewhere in this file.
    if (!DEVICE_BACKED_APP_CODES.has(appCode)) return;
    // Counting and then inserting is a race: N simultaneous activations would all count the same "free seats" and all succeed.
    // The lock is held to the end of the caller's transaction, so the next activation counts AFTER this one's device exists.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'device-quota:' + restaurantId + ':' + appCode}))`;
    const subs = await tx.subscription.findMany({
      where: { restaurantId, status: { in: ['TRIAL', 'ACTIVE'] } },
      select: { id: true, plan: { select: { maxDevices: true } } }
    });
    if (subs.length === 0) return;

    const row = await tx.applicationEntitlement.findFirst({
      where: { subscriptionId: { in: subs.map((s) => s.id) }, appCode, enabled: true }
    });
    if (!row) return;

    const owningSub = subs.find((s) => s.id === row.subscriptionId);
    if (!owningSub) return;
    const featureQuota =
      row.deviceQuota === null
        ? (await tx.feature.findFirst({ where: { appCode, isActive: true }, select: { defaultDeviceQuota: true } }))?.defaultDeviceQuota
        : null;
    const quota = row.deviceQuota ?? featureQuota ?? owningSub.plan.maxDevices;

    const activeDeviceCount = await tx.device.count({
      where: { restaurantId, type: appCode as unknown as DeviceType, status: { not: 'REVOKED' } }
    });
    if (activeDeviceCount >= quota) {
      throw new ConflictException(
        `This restaurant's ${appCode} entitlement allows ${quota} device${quota === 1 ? '' : 's'}, and that limit has been reached. Revoke an unused device or upgrade the plan to activate another.`
      );
    }
  }
}
