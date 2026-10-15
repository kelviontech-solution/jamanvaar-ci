import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PlatformUser, Prisma, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApplicationEntitlementsService, ResolvedEntitlement } from '../application-entitlements/application-entitlements.service';
import { QR_APP_CODE, QR_AUDIT, startOfDayIn } from '../qr/qr.support';
import { QR_CAPABILITIES } from '../application-entitlements/qr-capabilities';
import { DEFAULT_QR_BUNDLES, qrBundleSchema } from './qr-feature-bundles';

/** The Super Admin's view of a restaurant's QR entitlement. It is a projection of the ONE entitlement result, not a second source. */
export interface QrEntitlement {
  qrEntitled: boolean;
  qrOrderingEnabled: boolean;
  /** Null means no limit is configured on the plan or the override. */
  maxActiveTables: number | null;
  maxOrdersPerDay: number | null;
  digitalMenu: boolean;
  guestCustomization: boolean;
  liveOrderTracking: boolean;
  qrAnalytics: boolean;
  onlinePayments: boolean;
  capabilities?: Record<string, boolean>;
  capabilityStatus?: Array<{code: string; enabled: boolean; reason: string}>;
  source: 'PLAN' | 'PLATFORM_OVERRIDE';
  reason: string;
  planName?: string | null;
}

/** Computed from real orders and codes at the time of asking; nothing here is reported by a client. */
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
  maxActiveTables: number | null;
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
  branches: {id:string;name:string}[];
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

/** What a Super Admin may change for one restaurant. Stored on the subscription's own entitlement row, on top of the plan. */
export type QrEntitlementOverride = Partial<Omit<QrEntitlement, 'source' | 'reason' | 'capabilityStatus' | 'planName'>>;

export const QR_ENTITLEMENT_UPDATED_ACTION = 'RESTAURANT_QR_ENTITLEMENT_UPDATED';
export const QR_USAGE_REPORTED_ACTION = 'RESTAURANT_QR_USAGE_REPORTED';
const QR_AUDIT_ACTIONS = [QR_ENTITLEMENT_UPDATED_ACTION, QR_USAGE_REPORTED_ACTION, QR_AUDIT.FEATURE_ENABLED, QR_AUDIT.FEATURE_DISABLED, QR_AUDIT.CREATED, QR_AUDIT.REGENERATED, QR_AUDIT.REVOKED, QR_AUDIT.DISABLED, QR_AUDIT.ENABLED, QR_AUDIT.SETTINGS_CHANGED];

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const readBool = (r: Record<string, unknown>, ...keys: string[]): boolean | undefined => {
  for (const k of keys) if (typeof r[k] === 'boolean') return r[k] as boolean;
  return undefined;
};
const readInt = (r: Record<string, unknown>, ...keys: string[]): number | null => {
  for (const k of keys) if (typeof r[k] === 'number' && Number.isFinite(r[k]) && (r[k] as number) >= 0) return Math.floor(r[k] as number);
  return null;
};

/** Override keys as stored (same names a plan's feature list uses, so a plan and an override speak one language). */
const OVERRIDE_KEYS: Record<string, string> = {
  maxActiveTables: 'qrMaxActiveTables',
  maxOrdersPerDay: 'qrMaxOrdersPerDay',
  digitalMenu: 'qrDigitalMenu',
  guestCustomization: 'qrGuestCustomization',
  liveOrderTracking: 'qrLiveOrderTracking',
  qrAnalytics: 'qrAnalytics',
  onlinePayments: 'qrOnlinePayments'
};

@Injectable()
export class QrOrderingService {
  async bundles() {
    return this.prisma.runAsPlatform(async tx => {
      const row = await tx.platformSetting.findUnique({where:{key:'qr.featureBundles'}});
      return row ? qrBundleSchema.parse(row.value) : DEFAULT_QR_BUNDLES;
    });
  }
  async saveBundles(input:unknown,actor:PlatformUser) {
    const parsed=qrBundleSchema.safeParse(input);
    if(!parsed.success)throw new BadRequestException(parsed.error.issues.map(i=>i.message).join('; '));
    return this.prisma.runAsPlatform(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('qr-feature-bundles'))`;
      const row=await tx.platformSetting.findUnique({where:{key:'qr.featureBundles'}});
      const previous=row?qrBundleSchema.parse(row.value):DEFAULT_QR_BUNDLES;
      if(previous.revision!==parsed.data.revision)throw new ConflictException('Bundles changed. Reload before saving.');
      const next={...parsed.data,revision:previous.revision+1};
      await tx.platformSetting.upsert({where:{key:'qr.featureBundles'},create:{key:'qr.featureBundles',category:'CATALOG',description:'Reviewed optional QR feature bundles',value:next,updatedBy:actor.id},update:{value:next,updatedBy:actor.id}});
      await this.audit.log({actorType:'PLATFORM',actorId:actor.id,action:'QR_FEATURE_BUNDLES_UPDATED',category:'SAAS',details:{revision:next.revision,bundleIds:next.bundles.map(b=>b.id)}},tx);
      return next;
    });
  }
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly entitlements: ApplicationEntitlementsService
  ) {}

  // ---------------------------------------------------------------- projection of the one entitlement result

  private project(res: ResolvedEntitlement): QrEntitlement {
    const l = res.limits;
    const on = res.enabled;
    return {
      qrEntitled: on,
      qrOrderingEnabled: on && l.qrServiceEnabled !== false,
      maxActiveTables: readInt(l, 'qrMaxActiveTables', 'maxActiveTables'),
      maxOrdersPerDay: readInt(l, 'qrMaxOrdersPerDay', 'maxOrdersPerDay'),
      digitalMenu: on && (readBool(l, 'qrDigitalMenu', 'digitalMenu') ?? true),
      guestCustomization: on && (readBool(l, 'qrGuestCustomization', 'guestCustomization') ?? true),
      liveOrderTracking: on && (readBool(l, 'qrLiveOrderTracking', 'liveOrderTracking') ?? true),
      qrAnalytics: on && (readBool(l, 'qrAnalytics') ?? true),
      onlinePayments: on && (readBool(l, 'qrOnlinePayments', 'onlinePayments') ?? true),
      capabilities: Object.fromEntries(Object.entries(QR_CAPABILITIES).map(([code, key]) => [code, on && l[key] === true])),
      source: res.source === 'MANUAL_OVERRIDE' ? 'PLATFORM_OVERRIDE' : 'PLAN',
      reason: res.reason,
      planName: res.planName
    };
  }

  /** `restaurantId` must come from the authenticated principal, never from the request payload. */
  public async getEntitlementForRestaurant(restaurantId: string): Promise<QrEntitlement> {
    return this.prisma.runAsPlatform(async tx => {
      const result = await this.entitlements.resolveQrCapabilities(tx, restaurantId);
      return {...this.project(result.module), capabilityStatus: result.capabilities};
    });
  }

  // ---------------------------------------------------------------- usage: computed, never reported

  private async usageFor(restaurantId: string, timezone: string): Promise<QrUsageSnapshot> {
    const dayStart = startOfDayIn(timezone);
    const [activeTables, orders] = await this.prisma.runAsPlatform((tx) =>
      Promise.all([
        tx.qrCode.count({ where: { restaurantId, status: 'ACTIVE' } }),
        tx.syncedOrder.findMany({ where: { restaurantId, source: 'QR', createdAt: { gte: dayStart }, NOT: { status: { in: ['CANCELLED', 'VOIDED', 'REFUNDED'] } } }, select: { totalAmount: true } })
      ])
    );
    return { activeTables, ordersToday: orders.length, revenueToday: orders.reduce((s, o) => s + o.totalAmount, 0) / 100, reportedAt: new Date().toISOString() };
  }

  // ---------------------------------------------------------------- Super Admin surface

  private readonly include = {
    branches: { select: { id: true, name: true, status: true } },
    subscriptions: { where: { status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] as Array<'TRIAL' | 'ACTIVE' | 'PAST_DUE'> }, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' as const }, include: { plan: true } }
  };

  private async load(restaurantId: string) {
    const restaurant = await this.prisma.runAsPlatform((tx) => tx.restaurant.findFirst({ where: { id: restaurantId, deletedAt: null }, include: this.include }));
    if (!restaurant) throw new NotFoundException(`Restaurant with ID ${restaurantId} not found`);
    return restaurant;
  }

  private toItem(restaurant: Awaited<ReturnType<QrOrderingService['load']>>, entitlement: QrEntitlement, usage: QrUsageSnapshot): RestaurantQrStatusItem {
    const plan = restaurant.subscriptions[0]?.plan;
    let status: RestaurantQrStatusItem['status'] = 'ACTIVE';
    if (!entitlement.qrEntitled) status = 'NOT_ENTITLED';
    else if (!entitlement.qrOrderingEnabled) status = 'DISABLED';
    else if (entitlement.maxActiveTables !== null && usage.activeTables >= entitlement.maxActiveTables) status = 'LIMIT_REACHED';
    return {
      id: restaurant.id,
      name: restaurant.name,
      city: restaurant.city ?? undefined,
      primaryBranchName: restaurant.branches[0]?.name ?? 'No branch',
      branchCount: restaurant.branches.length,
      planName: entitlement.planName ?? plan?.name ?? 'No plan',
      planTier: plan?.tier ?? 'NONE',
      qrEntitled: entitlement.qrEntitled,
      qrOrderingEnabled: entitlement.qrOrderingEnabled,
      maxActiveTables: entitlement.maxActiveTables,
      activeQrTables: usage.activeTables,
      ordersToday: usage.ordersToday,
      revenueToday: usage.revenueToday,
      hasUsageData: true,
      usageReportedAt: usage.reportedAt,
      status,
      lastActivityAt: usage.ordersToday > 0 ? usage.reportedAt : null
    };
  }

  public async getQrRestaurants(): Promise<RestaurantQrStatusItem[]> {
    const restaurants = await this.prisma.runAsPlatform((tx) => tx.restaurant.findMany({ where: { deletedAt: null }, include: this.include, orderBy: { name: 'asc' } }));
    const out: RestaurantQrStatusItem[] = [];
    for (const r of restaurants) {
      const entitlement = await this.getEntitlementForRestaurant(r.id);
      out.push(this.toItem(r, entitlement, await this.usageFor(r.id, r.timezone)));
    }
    return out;
  }

  public async getPlatformQrMetrics(): Promise<PlatformQrMetrics> {
    const list = await this.getQrRestaurants();
    return {
      totalRestaurants: list.length,
      activeQrRestaurants: list.filter((r) => r.status === 'ACTIVE' || r.status === 'LIMIT_REACHED').length,
      disabledQrRestaurants: list.filter((r) => r.status === 'DISABLED' || r.status === 'NOT_ENTITLED').length,
      totalActiveTables: list.reduce((s, r) => s + r.activeQrTables, 0),
      totalQrOrdersToday: list.reduce((s, r) => s + r.ordersToday, 0),
      qrRevenueToday: list.reduce((s, r) => s + r.revenueToday, 0),
      restaurantsApproachingLimit: list.filter((r) => r.maxActiveTables !== null && r.maxActiveTables > 0 && r.activeQrTables >= r.maxActiveTables * 0.9).length,
      restaurantsReportingUsage: list.length,
      restaurantsWithoutUsageData: 0
    };
  }

  public async getRestaurantQrDetail(restaurantId: string): Promise<RestaurantQrDetail> {
    const restaurant = await this.load(restaurantId);
    const entitlement = await this.getEntitlementForRestaurant(restaurantId);
    const usage = await this.usageFor(restaurantId, restaurant.timezone);
    return { restaurant: this.toItem(restaurant, entitlement, usage), entitlement, usage, branches:restaurant.branches.filter(b=>b.status==='ACTIVE').map(b=>({id:b.id,name:b.name})),planEntitlements: asRecord(restaurant.subscriptions[0]?.plan?.entitlements) };
  }

  public async getRestaurantUsage(restaurantId: string): Promise<{ usage: QrUsageSnapshot | null }> {
    const restaurant = await this.load(restaurantId);
    return { usage: await this.usageFor(restaurantId, restaurant.timezone) };
  }

  public async getRestaurantQrAudit(restaurantId: string): Promise<QrAuditEntry[]> {
    await this.load(restaurantId);
    const rows = await this.prisma.platformDb.auditLog.findMany({
      where: { action: { in: QR_AUDIT_ACTIONS }, OR: [{ restaurantId }, { details: { path: ['restaurantId'], equals: restaurantId } }] },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    return rows.map((row) => ({ id: row.id, action: row.action, actorId: row.actorId ?? null, details: asRecord(row.details), createdAt: row.createdAt.toISOString() }));
  }

  /**
   * A per-restaurant change goes onto the subscription's own entitlement row through the same service every other
   * application switch uses (dependency checks, audit), never onto the plan and never into a side table.
   */
  public async updateRestaurantEntitlement(restaurantId: string, updates: QrEntitlementOverride, actor: PlatformUser): Promise<RestaurantQrStatusItem> {
    const allowed = new Set(['qrEntitled', 'qrOrderingEnabled', 'capabilities', ...Object.keys(OVERRIDE_KEYS)]);
    if (!updates || typeof updates !== 'object' || Array.isArray(updates) || Object.keys(updates).some(k => !allowed.has(k))) throw new BadRequestException('Unknown QR entitlement field');
    for (const key of ['qrEntitled','qrOrderingEnabled'] as const) if (updates[key] !== undefined && typeof updates[key] !== 'boolean') throw new BadRequestException(`${key} must be a boolean`);
    const restaurant = await this.load(restaurantId);
    const subscription = restaurant.subscriptions[0];
    if (!subscription) throw new BadRequestException('This restaurant has no active subscription to attach an override to.');

    const config: Record<string, unknown> = {};
    if (updates.qrOrderingEnabled !== undefined) config.qrServiceEnabled = updates.qrOrderingEnabled;
    if (updates.capabilities !== undefined) {
      if (!updates.capabilities || typeof updates.capabilities !== 'object' || Array.isArray(updates.capabilities)) throw new BadRequestException('Capabilities must be an object');
      for (const [code, enabled] of Object.entries(updates.capabilities)) {
        if (!Object.prototype.hasOwnProperty.call(QR_CAPABILITIES, code) || typeof enabled !== 'boolean') throw new BadRequestException('Unknown QR capability or invalid boolean');
        config[QR_CAPABILITIES[code as keyof typeof QR_CAPABILITIES]] = enabled;
      }
    }
    for (const [field, key] of Object.entries(OVERRIDE_KEYS)) {
      const value = (updates as Record<string, unknown>)[field];
      if (value === undefined) continue;
      if (field === 'maxActiveTables' || field === 'maxOrdersPerDay') {
        if (value !== null && (typeof value !== 'number' || !Number.isInteger(value) || value < 0)) throw new BadRequestException(`"${field}" must be a non-negative integer`);
      } else if (typeof value !== 'boolean') {
        throw new BadRequestException(`"${field}" must be a boolean`);
      }
      config[key] = value;
    }
    const enable = updates.qrEntitled;
    if (enable === undefined && Object.keys(config).length === 0) throw new BadRequestException('No supported QR entitlement fields supplied');

    await this.prisma.runAsPlatform(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'qr-grants:' + restaurantId}))`;
    const rows = await tx.applicationEntitlement.findMany({ where: { subscriptionId: { in: restaurant.subscriptions.map(s => s.id) }, appCode: QR_APP_CODE } });
    if (!rows.length) throw new NotFoundException('No QR ordering entitlement row exists.');
    // A platform-wide restaurant override must affect every current QR grant,
    // otherwise a second subscription can silently keep a revoked feature alive.
    for (const row of rows) await this.entitlements.update(row.subscriptionId, QR_APP_CODE, { ...(enable !== undefined ? { enabled: enable } : {}), ...(Object.keys(config).length ? { config: { ...asRecord(row.config), ...config } } : {}), acknowledgeDeviceImpact: true }, actor, tx);

    await this.audit.log({
      actorType: 'PLATFORM', actorId: actor.id, restaurantId, action: enable === undefined ? QR_ENTITLEMENT_UPDATED_ACTION : enable ? QR_AUDIT.FEATURE_ENABLED : QR_AUDIT.FEATURE_DISABLED, category: 'SAAS',
      details: { restaurantId, restaurantName: restaurant.name, subscriptionId: subscription.id, updates }
    }, tx);
    });

    const entitlement = await this.getEntitlementForRestaurant(restaurantId);
    return this.toItem(restaurant, entitlement, await this.usageFor(restaurantId, restaurant.timezone));
  }

  // ---------------------------------------------------------------- tenant surface

  /** Kept for older Restaurant Admin builds that still call it: it now ignores the body and returns what the server measures. */
  public async reportUsage(actor: User, _ignored?: unknown): Promise<QrUsageSnapshot> {
    const restaurant = await this.load(actor.restaurantId);
    return this.usageFor(actor.restaurantId, restaurant.timezone);
  }
}
