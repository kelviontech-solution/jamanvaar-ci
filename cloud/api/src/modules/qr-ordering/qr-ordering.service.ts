import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PlatformUser, Prisma, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface QrEntitlement {
  qrEntitled: boolean;
  qrOrderingEnabled: boolean;
  maxActiveTables: number;
  maxOrdersPerDay: number | null;
  digitalMenu: boolean;
  guestCustomization: boolean;
  liveOrderTracking: boolean;
  qrAnalytics: boolean;
  onlinePayments: boolean;
  source: 'PLAN' | 'PLATFORM_OVERRIDE';
}

export interface QrUsageSnapshot {
  activeTables: number;
  ordersToday: number;
  revenueToday: number;
  reportedAt: string;
}

export interface RestaurantQrStatusItem {
  id: string;
  name: string;
  city?: string;
  primaryBranchName: string;
  branchCount: number;
  planName: string;
  planTier: string;
  qrEntitled: boolean;
  qrOrderingEnabled: boolean;
  maxActiveTables: number;
  activeQrTables: number;
  ordersToday: number;
  revenueToday: number;
  hasUsageData: boolean;
  usageReportedAt: string | null;
  status: 'ACTIVE' | 'DISABLED' | 'LIMIT_REACHED' | 'NOT_ENTITLED';
  lastActivityAt: string | null;
}

export interface PlatformQrMetrics {
  totalRestaurants: number;
  activeQrRestaurants: number;
  disabledQrRestaurants: number;
  totalActiveTables: number;
  totalQrOrdersToday: number;
  qrRevenueToday: number;
  restaurantsApproachingLimit: number;
  restaurantsReportingUsage: number;
  restaurantsWithoutUsageData: number;
}

export interface RestaurantQrDetail {
  restaurant: RestaurantQrStatusItem;
  entitlement: QrEntitlement;
  usage: QrUsageSnapshot | null;
  planEntitlements: Record<string, unknown>;
}

export interface QrAuditEntry {
  id: string;
  action: string;
  actorId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

/** Partial override a Super Admin can persist on top of the plan-derived entitlement. */
export type QrEntitlementOverride = Partial<Omit<QrEntitlement, 'source'>>;

export interface QrUsageReportInput {
  activeTables: number;
  ordersToday: number;
  revenueToday: number;
}

/**
 * QR entitlement overrides and tenant-reported usage are durable rows in
 * `PlatformSetting` (category `QR_ORDERING`) - not process memory. There is no
 * dedicated QR model in this phase, and inventing one would need a migration;
 * PlatformSetting is already the platform's key/value store of record and is
 * read through `runAsPlatform` exactly like platform-settings does.
 *
 * Usage numbers are ONLY ever what a restaurant actually reported through
 * `POST /api/v1/tenant/qr-ordering/usage`. A restaurant that has never
 * reported reads back as zeros with `hasUsageData: false` - the Super Admin UI
 * renders that as "No data reported". Nothing here synthesises a
 * plausible-looking figure.
 */
const QR_SETTING_CATEGORY = 'QR_ORDERING';
const QR_ENTITLEMENT_KEY_PREFIX = 'qr_ordering.entitlement.';
const QR_USAGE_KEY_PREFIX = 'qr_ordering.usage.';

export const QR_ENTITLEMENT_UPDATED_ACTION = 'RESTAURANT_QR_ENTITLEMENT_UPDATED';
export const QR_USAGE_REPORTED_ACTION = 'RESTAURANT_QR_USAGE_REPORTED';
const QR_AUDIT_ACTIONS = [QR_ENTITLEMENT_UPDATED_ACTION, QR_USAGE_REPORTED_ACTION];

const entitlementKey = (restaurantId: string) => `${QR_ENTITLEMENT_KEY_PREFIX}${restaurantId}`;
const usageKey = (restaurantId: string) => `${QR_USAGE_KEY_PREFIX}${restaurantId}`;

const QR_RESTAURANT_INCLUDE = {
  branches: { select: { id: true, name: true, status: true } },
  subscriptions: {
    where: { status: 'ACTIVE' as const },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: {
      plan: true,
      // Phase 5: QR_ORDERING is now a first-class AppCode with its own ApplicationEntitlement
      // row — pre-fetched here (same style as `plan`) so resolveEntitlement can check it
      // synchronously alongside the legacy flat flag, with no extra query.
      applicationEntitlements: { where: { appCode: 'QR_ORDERING' as const, enabled: true }, take: 1 }
    }
  }
};

type QrRestaurantRow = Prisma.RestaurantGetPayload<{ include: typeof QR_RESTAURANT_INCLUDE }>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readBoolean(source: Record<string, unknown>, key: string): boolean | undefined {
  const raw = source[key];
  return typeof raw === 'boolean' ? raw : undefined;
}

function readPositiveInt(source: Record<string, unknown>, key: string): number | undefined {
  const raw = source[key];
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : undefined;
}

@Injectable()
export class QrOrderingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  // ---------------------------------------------------------------------
  // Platform (Super Admin) surface
  // ---------------------------------------------------------------------

  public async getQrRestaurants(): Promise<RestaurantQrStatusItem[]> {
    const [restaurants, settings] = await Promise.all([
      this.prisma.runAsPlatform((tx) =>
        tx.restaurant.findMany({
          where: { deletedAt: null },
          include: QR_RESTAURANT_INCLUDE,
          orderBy: { name: 'asc' }
        })
      ),
      this.loadQrSettings()
    ]);

    return restaurants.map((restaurant) => {
      const entitlement = this.resolveEntitlement(
        restaurant,
        settings.get(entitlementKey(restaurant.id))
      );
      const usage = this.parseUsage(settings.get(usageKey(restaurant.id)));
      return this.toStatusItem(restaurant, entitlement, usage);
    });
  }

  public async getPlatformQrMetrics(): Promise<PlatformQrMetrics> {
    const list = await this.getQrRestaurants();
    const reporting = list.filter((r) => r.hasUsageData);

    return {
      totalRestaurants: list.length,
      activeQrRestaurants: list.filter((r) => r.status === 'ACTIVE' || r.status === 'LIMIT_REACHED').length,
      disabledQrRestaurants: list.filter((r) => r.status === 'DISABLED' || r.status === 'NOT_ENTITLED').length,
      // Every total below is a sum over reported snapshots only - a restaurant
      // that never reported contributes nothing rather than a guess.
      totalActiveTables: reporting.reduce((sum, r) => sum + r.activeQrTables, 0),
      totalQrOrdersToday: reporting.reduce((sum, r) => sum + r.ordersToday, 0),
      qrRevenueToday: reporting.reduce((sum, r) => sum + r.revenueToday, 0),
      restaurantsApproachingLimit: reporting.filter(
        (r) => r.maxActiveTables > 0 && r.activeQrTables >= r.maxActiveTables * 0.9
      ).length,
      restaurantsReportingUsage: reporting.length,
      restaurantsWithoutUsageData: list.length - reporting.length
    };
  }

  public async getRestaurantQrDetail(restaurantId: string): Promise<RestaurantQrDetail> {
    const restaurant = await this.findRestaurantOrThrow(restaurantId);
    const [overrideValue, usageValue] = await Promise.all([
      this.readSetting(entitlementKey(restaurantId)),
      this.readSetting(usageKey(restaurantId))
    ]);

    const entitlement = this.resolveEntitlement(restaurant, overrideValue);
    const usage = this.parseUsage(usageValue);

    return {
      restaurant: this.toStatusItem(restaurant, entitlement, usage),
      entitlement,
      usage,
      planEntitlements: asRecord(restaurant.subscriptions[0]?.plan?.entitlements)
    };
  }

  public async getRestaurantUsage(restaurantId: string): Promise<{ usage: QrUsageSnapshot | null }> {
    await this.findRestaurantOrThrow(restaurantId);
    return { usage: this.parseUsage(await this.readSetting(usageKey(restaurantId))) };
  }

  public async getRestaurantQrAudit(restaurantId: string): Promise<QrAuditEntry[]> {
    await this.findRestaurantOrThrow(restaurantId);

    // AuditLog carries no RLS in this phase (see schema.prisma) - a plain
    // query matches audit-query.service.ts. Rows written before this module
    // persisted `restaurantId` on the audit row itself only carry the id
    // inside `details`, so both shapes are matched.
    const rows = await this.prisma.platformDb.auditLog.findMany({
      where: {
        action: { in: QR_AUDIT_ACTIONS },
        OR: [
          { restaurantId },
          { details: { path: ['restaurantId'], equals: restaurantId } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      actorId: row.actorId ?? null,
      details: asRecord(row.details),
      createdAt: row.createdAt.toISOString()
    }));
  }

  public async updateRestaurantEntitlement(
    restaurantId: string,
    updates: QrEntitlementOverride,
    actor: PlatformUser
  ): Promise<RestaurantQrStatusItem> {
    const restaurant = await this.findRestaurantOrThrow(restaurantId);

    const currentOverride = asRecord(await this.readSetting(entitlementKey(restaurantId)));
    const sanitized = this.sanitizeOverride(updates);
    if (Object.keys(sanitized).length === 0) {
      throw new BadRequestException('No supported QR entitlement fields supplied');
    }

    const nextOverride: Record<string, unknown> = { ...currentOverride, ...sanitized };

    await this.prisma.runAsPlatform(async (tx) => {
      await tx.platformSetting.upsert({
        where: { key: entitlementKey(restaurantId) },
        update: { value: nextOverride as Prisma.InputJsonValue, category: QR_SETTING_CATEGORY, updatedBy: actor.id },
        create: {
          key: entitlementKey(restaurantId),
          category: QR_SETTING_CATEGORY,
          description: `QR ordering entitlement override for restaurant ${restaurantId}`,
          value: nextOverride as Prisma.InputJsonValue,
          updatedBy: actor.id
        }
      });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId,
          action: QR_ENTITLEMENT_UPDATED_ACTION,
          category: 'SAAS',
          details: {
            restaurantId,
            restaurantName: restaurant.name,
            updates: sanitized,
            previousOverride: currentOverride
          }
        },
        tx
      );
    });

    const entitlement = this.resolveEntitlement(restaurant, nextOverride);
    const usage = this.parseUsage(await this.readSetting(usageKey(restaurantId)));
    return this.toStatusItem(restaurant, entitlement, usage);
  }

  // ---------------------------------------------------------------------
  // Tenant surface - always scoped to the caller's own restaurant
  // ---------------------------------------------------------------------

  /** `restaurantId` must come from the authenticated principal, never from the request payload. */
  public async getEntitlementForRestaurant(restaurantId: string): Promise<QrEntitlement> {
    const restaurant = await this.findOwnRestaurantOrThrow(restaurantId);
    return this.resolveEntitlement(restaurant, await this.readSetting(entitlementKey(restaurantId)));
  }

  public async reportUsage(actor: User, input: QrUsageReportInput): Promise<QrUsageSnapshot> {
    const restaurantId = actor.restaurantId;
    await this.findOwnRestaurantOrThrow(restaurantId);

    const snapshot: QrUsageSnapshot = {
      activeTables: this.requireCount(input.activeTables, 'activeTables'),
      ordersToday: this.requireCount(input.ordersToday, 'ordersToday'),
      revenueToday: this.requireAmount(input.revenueToday, 'revenueToday'),
      reportedAt: new Date().toISOString()
    };

    await this.prisma.runAsPlatform(async (tx) => {
      await tx.platformSetting.upsert({
        where: { key: usageKey(restaurantId) },
        update: {
          value: snapshot as unknown as Prisma.InputJsonValue,
          category: QR_SETTING_CATEGORY,
          updatedBy: actor.id
        },
        create: {
          key: usageKey(restaurantId),
          category: QR_SETTING_CATEGORY,
          description: `QR ordering usage snapshot reported by restaurant ${restaurantId}`,
          value: snapshot as unknown as Prisma.InputJsonValue,
          updatedBy: actor.id
        }
      });

      await this.audit.log(
        {
          actorType: 'TENANT',
          actorId: actor.id,
          restaurantId,
          action: QR_USAGE_REPORTED_ACTION,
          category: 'SAAS',
          details: { restaurantId, ...snapshot }
        },
        tx
      );
    });

    return snapshot;
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private async findRestaurantOrThrow(restaurantId: string): Promise<QrRestaurantRow> {
    const restaurant = await this.prisma.runAsPlatform((tx) =>
      tx.restaurant.findFirst({
        where: { id: restaurantId, deletedAt: null },
        include: QR_RESTAURANT_INCLUDE
      })
    );
    if (!restaurant) {
      throw new NotFoundException(`Restaurant with ID ${restaurantId} not found`);
    }
    return restaurant;
  }

  /**
   * Tenant-facing lookup: reads the restaurant under its OWN RLS context, so
   * even a bug in a caller cannot surface another tenant's row here.
   */
  private async findOwnRestaurantOrThrow(restaurantId: string): Promise<QrRestaurantRow> {
    const restaurant = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.restaurant.findFirst({
        where: { id: restaurantId, deletedAt: null },
        include: QR_RESTAURANT_INCLUDE
      })
    );
    if (!restaurant) {
      throw new NotFoundException(`Restaurant with ID ${restaurantId} not found`);
    }
    return restaurant;
  }

  private async loadQrSettings(): Promise<Map<string, unknown>> {
    const rows = await this.prisma.runAsPlatform((tx) =>
      tx.platformSetting.findMany({
        where: { category: QR_SETTING_CATEGORY },
        select: { key: true, value: true }
      })
    );
    return new Map<string, unknown>(rows.map((row) => [row.key, row.value as unknown]));
  }

  private async readSetting(key: string): Promise<unknown> {
    const row = await this.prisma.runAsPlatform((tx) =>
      tx.platformSetting.findUnique({ where: { key }, select: { value: true } })
    );
    return row ? (row.value as unknown) : undefined;
  }

  /** Plan entitlements form the base; a persisted platform override wins field by field. */
  private resolveEntitlement(restaurant: QrRestaurantRow, rawOverride: unknown): QrEntitlement {
    const subscription = restaurant.subscriptions[0];
    const plan = subscription?.plan;
    const planTier = plan?.tier ?? 'CORE';
    const planEntitlements = asRecord(plan?.entitlements);

    // QR table ordering ships with JAMANVAAR PRO (INR 7,000); CORE (INR 5,000)
    // does not include it. Phase 5: QR_ORDERING is now also a real AppCode with its own
    // ApplicationEntitlement row (e.g. the JAMANVAAR QR tier grants it explicitly) — an
    // existing PRO-tier restaurant with only the legacy flag must keep working, so this is an
    // OR, not a replacement.
    const legacyQrEntitled = readBoolean(planEntitlements, 'qrTableOrdering') ?? planTier === 'PRO';
    const planQrEntitled = legacyQrEntitled || Boolean(subscription?.applicationEntitlements?.length);
    const planMaxTables = readPositiveInt(planEntitlements, 'qrMaxActiveTables') ?? (planTier === 'PRO' ? 50 : 15);

    const base: Omit<QrEntitlement, 'source'> = {
      qrEntitled: planQrEntitled,
      qrOrderingEnabled: planQrEntitled && restaurant.status === 'ACTIVE',
      maxActiveTables: planMaxTables,
      maxOrdersPerDay: readPositiveInt(planEntitlements, 'qrMaxOrdersPerDay') ?? null,
      digitalMenu: readBoolean(planEntitlements, 'qrDigitalMenu') ?? planQrEntitled,
      guestCustomization: readBoolean(planEntitlements, 'qrGuestCustomization') ?? planQrEntitled,
      liveOrderTracking: readBoolean(planEntitlements, 'qrLiveOrderTracking') ?? planQrEntitled,
      qrAnalytics: readBoolean(planEntitlements, 'qrAnalytics') ?? planQrEntitled,
      onlinePayments: readBoolean(planEntitlements, 'qrOnlinePayments') ?? planQrEntitled
    };

    const override = asRecord(rawOverride);
    const resolved: Omit<QrEntitlement, 'source'> = {
      qrEntitled: readBoolean(override, 'qrEntitled') ?? base.qrEntitled,
      qrOrderingEnabled: readBoolean(override, 'qrOrderingEnabled') ?? base.qrOrderingEnabled,
      maxActiveTables: readPositiveInt(override, 'maxActiveTables') ?? base.maxActiveTables,
      maxOrdersPerDay:
        override.maxOrdersPerDay === null
          ? null
          : readPositiveInt(override, 'maxOrdersPerDay') ?? base.maxOrdersPerDay,
      digitalMenu: readBoolean(override, 'digitalMenu') ?? base.digitalMenu,
      guestCustomization: readBoolean(override, 'guestCustomization') ?? base.guestCustomization,
      liveOrderTracking: readBoolean(override, 'liveOrderTracking') ?? base.liveOrderTracking,
      qrAnalytics: readBoolean(override, 'qrAnalytics') ?? base.qrAnalytics,
      onlinePayments: readBoolean(override, 'onlinePayments') ?? base.onlinePayments
    };

    // A revoked entitlement forces the switches off regardless of what an
    // older override row still says.
    if (!resolved.qrEntitled) {
      resolved.qrOrderingEnabled = false;
    }

    return {
      ...resolved,
      source: Object.keys(override).length > 0 ? 'PLATFORM_OVERRIDE' : 'PLAN'
    };
  }

  private parseUsage(rawUsage: unknown): QrUsageSnapshot | null {
    const usage = asRecord(rawUsage);
    const reportedAt = usage.reportedAt;
    if (typeof reportedAt !== 'string') return null;

    const activeTables = readPositiveInt(usage, 'activeTables');
    const ordersToday = readPositiveInt(usage, 'ordersToday');
    const revenueToday = usage.revenueToday;
    if (activeTables === undefined || ordersToday === undefined) return null;
    if (typeof revenueToday !== 'number' || !Number.isFinite(revenueToday) || revenueToday < 0) return null;

    return { activeTables, ordersToday, revenueToday, reportedAt };
  }

  private toStatusItem(
    restaurant: QrRestaurantRow,
    entitlement: QrEntitlement,
    usage: QrUsageSnapshot | null
  ): RestaurantQrStatusItem {
    const plan = restaurant.subscriptions[0]?.plan;
    const planTier = plan?.tier ?? 'CORE';

    let status: RestaurantQrStatusItem['status'] = 'ACTIVE';
    if (!entitlement.qrEntitled) status = 'NOT_ENTITLED';
    else if (!entitlement.qrOrderingEnabled) status = 'DISABLED';
    else if (usage && entitlement.maxActiveTables > 0 && usage.activeTables >= entitlement.maxActiveTables) {
      status = 'LIMIT_REACHED';
    }

    return {
      id: restaurant.id,
      name: restaurant.name,
      city: restaurant.city ?? undefined,
      primaryBranchName: restaurant.branches[0]?.name ?? 'Main Branch',
      branchCount: restaurant.branches.length,
      planName: plan?.name ?? (planTier === 'PRO' ? 'JAMANVAAR PRO (INR 7,000)' : 'JAMANVAAR CORE (INR 5,000)'),
      planTier,
      qrEntitled: entitlement.qrEntitled,
      qrOrderingEnabled: entitlement.qrOrderingEnabled,
      maxActiveTables: entitlement.maxActiveTables,
      // Zeros here mean "nothing reported", which `hasUsageData: false` states
      // explicitly - they are never a stand-in for unknown activity.
      activeQrTables: usage?.activeTables ?? 0,
      ordersToday: usage?.ordersToday ?? 0,
      revenueToday: usage?.revenueToday ?? 0,
      hasUsageData: usage !== null,
      usageReportedAt: usage?.reportedAt ?? null,
      status,
      lastActivityAt: usage?.reportedAt ?? null
    };
  }

  private sanitizeOverride(updates: QrEntitlementOverride): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const booleanFields: Array<keyof QrEntitlementOverride> = [
      'qrEntitled',
      'qrOrderingEnabled',
      'digitalMenu',
      'guestCustomization',
      'liveOrderTracking',
      'qrAnalytics',
      'onlinePayments'
    ];

    for (const field of booleanFields) {
      const value = updates[field];
      if (value === undefined) continue;
      if (typeof value !== 'boolean') {
        throw new BadRequestException(`"${field}" must be a boolean`);
      }
      out[field] = value;
    }

    if (updates.maxActiveTables !== undefined) {
      out.maxActiveTables = this.requireCount(updates.maxActiveTables, 'maxActiveTables');
    }

    if (updates.maxOrdersPerDay !== undefined) {
      out.maxOrdersPerDay =
        updates.maxOrdersPerDay === null ? null : this.requireCount(updates.maxOrdersPerDay, 'maxOrdersPerDay');
    }

    return out;
  }

  private requireCount(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      throw new BadRequestException(`"${field}" must be a non-negative integer`);
    }
    return value;
  }

  private requireAmount(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new BadRequestException(`"${field}" must be a non-negative number`);
    }
    return value;
  }
}
