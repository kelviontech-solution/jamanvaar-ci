import { branchLicense } from '../../common/security/branch-license';
import { activeProfile, scheduleProfile } from './profile-policy';
import { BadRequestException, ForbiddenException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Device, Prisma, PlatformUser } from '@prisma/client';
import type { RestaurantIdentityDto } from './dto/heartbeat.dto';
import { pageOf, parsePaging } from '../../common/paging';
import { ts } from '../../common/sql';
import { compareVersions, updateFor } from '../../common/version';
import { DEGRADED_WITHIN_MS, DeviceHealth, deviceHealth, healthWhere, ONLINE_WITHIN_MS } from '../../common/device-health';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { readActivePlatformNotice } from '../../common/platform-notice';

export interface HeartbeatDto {
  lastSyncAt?: Date;
  lastBackupAt?: Date;
  syncStatus?: string;
  appVersion?: string;
  updateReport?: { version: string; status: string; installedVersion?: string; message?: string };
  osPlatform?: string;
  pendingSyncCount?: number;
  syncError?: string | null;
  menuVersion?: number;
  profileRevision?: string;
  ipAddress?: string;
}

/**
 * No device ever gets fabricated here. Devices only ever appear once the
 * keypair-based activation flow (a later phase — see architecture doc §05)
 * actually registers one. Until then this module is a real, empty, honest
 * CRUD surface, not a placeholder with sample rows.
 */
@Injectable()
export class DevicesService {
  async guestRequestProgress(device: Device, id: string) {
    if (device.type !== 'KIOSK' || !id || id.length > 128) throw new ForbiddenException('Guest request unavailable');
    const row = await this.prisma.runAsTenant(device.restaurantId, tx => tx.syncedEntity.findFirst({where:{restaurantId:device.restaurantId,entityType:'SERVICE_MESSAGE',externalId:id},select:{payload:true}}));
    const payload = row?.payload as Record<string,unknown> | null;
    if (!payload || payload.kind !== 'CALL_STAFF' || payload.requesterDeviceId !== device.id || (payload.branchId ?? null) !== device.branchId) throw new NotFoundException('Guest request unavailable');
    return { status: payload.status === 'RESOLVED' ? 'RESOLVED' : payload.status === 'ACCEPTED' ? 'ACCEPTED' : 'SENT', updatedAt: payload.updatedAt };
  }
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  /**
   * Plain array without `page` (each row now carries its `health`); with `page`, a server-side
   * searched, filtered and paged envelope plus health counts for the same scope. Health uses the one
   * shared rule (common/device-health.ts): revoked, pending and never-seen are not "offline".
   */
  async list(query: {
    restaurantId?: string; q?: string; type?: string; health?: string; status?: string;
    needsAttention?: string; locked?: string; appVersion?: string; sort?: string; page?: unknown; pageSize?: unknown;
  } = {}) {
    const paging = parsePaging(query);
    const now = new Date();
    const q = query.q?.trim();
    const scope: Prisma.DeviceWhereInput = {
      ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
      ...(query.type ? { type: query.type as never } : {}),
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.appVersion ? { appVersion: query.appVersion } : {}),
      ...(q
        ? { OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { id: { startsWith: q } },
            { ipAddress: { contains: q } },
            { restaurant: { name: { contains: q, mode: 'insensitive' } } },
            { branch: { name: { contains: q, mode: 'insensitive' } } }
          ] }
        : {})
    };
    const lockedFilter: Prisma.DeviceWhereInput[] = query.locked === 'true' ? [{ isLocked: true }] : [];
    const healthFilter = query.health ? [healthWhere(query.health as DeviceHealth, now)].filter(Boolean) : [];
    // BUG: a freshly-activated device that has never sent its first heartbeat (lastSeenAt: null,
    // health "never_seen") was excluded from "needs attention" entirely -- Prisma's `lt` on a null
    // column never matches, so neither the offline nor degraded clause below ever caught it. A
    // terminal just activated but silent since is exactly the kind of thing an operator needs to
    // see, arguably more urgently than one that's merely degraded.
    const attention: Prisma.DeviceWhereInput[] =
      query.needsAttention === 'true'
        ? [{ OR: [healthWhere('offline', now), healthWhere('degraded', now), healthWhere('never_seen', now), { status: 'ACTIVE', syncError: { not: null } }] as Prisma.DeviceWhereInput[] }]
        : [];
    const where: Prisma.DeviceWhereInput = { AND: [scope, ...healthFilter, ...attention, ...lockedFilter] };
    const orderBy: Prisma.DeviceOrderByWithRelationInput[] =
      query.sort === 'lastSeen' ? [{ lastSeenAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'asc' }];
    const include = { restaurant: { select: { id: true, name: true } }, branch: { select: { id: true, name: true } } };
    const present = (d: Device) => ({ ...d, deviceTokenHash: undefined, health: deviceHealth(d, now) });

    return this.prisma.runAsPlatform(async (tx) => {
      if (!paging.paged) return (await tx.device.findMany({ where, orderBy, include })).map(present);
      const states: DeviceHealth[] = ['online', 'degraded', 'offline', 'never_seen', 'revoked', 'pending'];
      const [rows, total, lockedCount, ...counts] = await Promise.all([
        tx.device.findMany({ where, orderBy, include, skip: paging.skip, take: paging.take }),
        tx.device.count({ where }),
        tx.device.count({ where: { AND: [scope, { isLocked: true }] } }),
        ...states.map((s) => tx.device.count({ where: { AND: [scope, healthWhere(s, now)] } }))
      ]);
      const healthCounts = Object.fromEntries(states.map((s, i) => [s, counts[i]]));
      return {
        ...pageOf(rows.map(present), total, paging),
        healthCounts,
        lockedCount,
        thresholds: { onlineWithinMs: ONLINE_WITHIN_MS, degradedWithinMs: DEGRADED_WITHIN_MS }
      };
    });
  }

  /** One row per restaurant with fleet health, so an operator drills into the restaurant that has a problem. */
  async byRestaurant(query: { q?: string; page?: unknown; pageSize?: unknown } = {}) {
    const paging = parsePaging(query);
    const now = new Date();
    const online = new Date(now.getTime() - ONLINE_WITHIN_MS);
    const degraded = new Date(now.getTime() - DEGRADED_WITHIN_MS);
    const q = query.q?.trim();
    const like = q ? `%${q}%` : null;
    return this.prisma.runAsPlatform(async (tx) => {
      const limit = paging.paged ? paging.take : 1000;
      const offset = paging.paged ? paging.skip : 0;
      const rows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT r.id AS "restaurantId", r.name AS "restaurantName",
          COUNT(d.id)::int AS total,
          COUNT(*) FILTER (WHERE d.status = 'ACTIVE' AND d."lastSeenAt" >= ${ts(online)})::int AS online,
          COUNT(*) FILTER (WHERE d.status = 'ACTIVE' AND d."lastSeenAt" < ${ts(online)} AND d."lastSeenAt" >= ${ts(degraded)})::int AS degraded,
          COUNT(*) FILTER (WHERE d.status = 'ACTIVE' AND d."lastSeenAt" < ${ts(degraded)})::int AS offline,
          COUNT(*) FILTER (WHERE d.status = 'ACTIVE' AND d."lastSeenAt" IS NULL)::int AS "neverSeen",
          COUNT(*) FILTER (WHERE d.status = 'REVOKED')::int AS revoked,
          -- Same "never checked in yet" gap as list()'s attention filter: lastSeenAt IS NULL must be
          -- counted explicitly since "< online" never matches a NULL column in SQL either.
          COUNT(*) FILTER (WHERE d.status = 'ACTIVE' AND (d."lastSeenAt" < ${ts(online)} OR d."lastSeenAt" IS NULL OR d."syncError" IS NOT NULL))::int AS "needsAttention"
        FROM "Restaurant" r
        JOIN "Device" d ON d."restaurantId" = r.id
        WHERE r."deletedAt" IS NULL AND (${like}::text IS NULL OR r.name ILIKE ${like})
        GROUP BY r.id, r.name
        ORDER BY "needsAttention" DESC, r.name ASC
        LIMIT ${limit} OFFSET ${offset}
      `);

      // Which apps each restaurant actually has registered (not just a bare terminal count) -- a
      // card needs to say "POS x2, Kiosk x1, KDS x1" rather than just "4 terminals", otherwise it
      // tells the operator nothing they couldn't already see from the total.
      const restaurantIds = rows.map((r) => r.restaurantId as string);
      const typeCounts = restaurantIds.length
        ? await tx.device.groupBy({
            by: ['restaurantId', 'type'],
            where: { restaurantId: { in: restaurantIds }, status: { not: 'REVOKED' } },
            _count: { _all: true }
          })
        : [];
      const typesByRestaurant = new Map<string, Record<string, number>>();
      for (const row of typeCounts) {
        const bucket = typesByRestaurant.get(row.restaurantId) ?? {};
        bucket[row.type] = row._count._all;
        typesByRestaurant.set(row.restaurantId, bucket);
      }
      const withTypes = rows.map((r) => ({ ...r, deviceTypes: typesByRestaurant.get(r.restaurantId as string) ?? {} }));

      if (!paging.paged) return withTypes;
      const totalRows = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
        SELECT COUNT(DISTINCT r.id)::int AS n FROM "Restaurant" r JOIN "Device" d ON d."restaurantId" = r.id
        WHERE r."deletedAt" IS NULL AND (${like}::text IS NULL OR r.name ILIKE ${like})
      `);
      return pageOf(withTypes, totalRows[0]?.n ?? 0, paging);
    });
  }

  async rename(id: string, name: string, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.device.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Device not found');
      const updated = await tx.device.update({ where: { id }, data: { name } });
      await this.audit.log(
        { actorType: 'PLATFORM', actorId: actor.id, restaurantId: existing.restaurantId, action: 'DEVICE_RENAMED', category: 'DEVICE', details: { deviceId: id, from: existing.name, to: name } },
        tx
      );
      return { ...updated, deviceTokenHash: undefined };
    });
  }

  async getById(id: string) {
    const device = await this.prisma.runAsPlatform((tx) =>
      tx.device.findUnique({
        where: { id },
        include: {
          restaurant: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } }
        }
      })
    );
    if (!device) throw new NotFoundException('Device not found');
    // B2-053: this returned the raw row, including deviceTokenHash — the stored hash of the
    // terminal's own credential — to any caller with `devices` read access, unlike list()/
    // rename() three lines below, which already strip it. Never return it to any client.
    return { ...device, deviceTokenHash: undefined };
  }

  async revoke(id: string, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.device.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Device not found');
      if (existing.status === 'REVOKED') throw new ConflictException('Device is already revoked');

      const updated = await tx.device.update({ where: { id }, data: { status: 'REVOKED' } });
      // Restaurant Admin sessions created on this terminal end with it.
      await tx.tenantRefreshToken.updateMany({ where: { deviceId: id, revokedAt: null }, data: { revokedAt: new Date() } });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          restaurantId: existing.restaurantId,
          action: 'DEVICE_REVOKED',
          category: 'DEVICE',
          details: { deviceId: id, previousStatus: existing.status }
        },
        tx
      );

      return { ...updated, deviceTokenHash: undefined };
    });
  }

  private static readonly APP_CODE_FOR_DEVICE: Record<string, string> = {
    POS: 'POS', POS_ADMIN: 'RESTAURANT_ADMIN', CAPTAIN: 'CAPTAIN', KDS: 'KDS', KIOSK: 'KIOSK', KIOSK_ADMIN: 'KIOSK_ADMIN'
  };

  /** The newest STABLE release of the terminal's own app, as an offer relative to the version it runs. */
  private async latestUpdateFor(deviceType: string, currentVersion: string | null, osPlatform: string | null) {
    const releases = await this.prisma.runAsPlatform((tx) =>
      tx.appRelease.findMany({ where: { appCode: DevicesService.APP_CODE_FOR_DEVICE[deviceType] ?? deviceType, channel: 'STABLE', status: 'PUBLISHED' } })
    );
    // Versions compare numerically, so pick the newest in code rather than trusting a database sort.
    const newest = releases.filter(r => updateFor(currentVersion, { ...r, downloadUrls: r.downloadUrls as Record<string, string> | null }, osPlatform) !== null).sort((a, b) => compareVersions(b.version, a.version))[0] ?? null;
    return updateFor(
      currentVersion,
      newest ? { ...newest, downloadUrls: newest.downloadUrls as Record<string, string> | null } : null,
      osPlatform
    );
  }

  /** The longest-running active extension aimed at this restaurant, this branch (or every branch), this terminal (or every terminal). */
  private async activeExtensionFor(device: Device) {
    const ext = await this.prisma.runAsTenant(device.restaurantId, (tx) =>
      tx.offlineExtension.findFirst({
        where: {
          restaurantId: device.restaurantId,
          status: 'ACTIVE',
          validUntil: { gt: new Date() },
          AND: [{ OR: [{ deviceId: null }, { deviceId: device.id }] }, { OR: [{ branchId: null }, ...(device.branchId ? [{ branchId: device.branchId }] : [])] }]
        },
        orderBy: { validUntil: 'desc' }
      })
    );
    return ext ? { id: ext.id, payload: ext.certificatePayload, signature: ext.certificateSignature, validUntil: ext.validUntil.toISOString() } : null;
  }

  /**
   * ENT-001-adjacent gap this closes: Device.lastSyncAt/lastBackupAt/syncStatus
   * existed as schema columns with nothing populating them, because no device
   * had any way to authenticate a write to its own row. DeviceAuthGuard is
   * that path now — the device identifies itself via its own long-lived
   * credential, never a caller-supplied device id.
   */
  /**
   * What a Branch Core needs to authorize devices with the internet down: who may connect (credential
   * hashes, never plain tokens), which app each device may run, and the subscription window. Only a
   * Restaurant Admin console device may fetch it, and only for its own restaurant (and branch, if bound).
   */
  async getBranchRoster(issuer: Device) {
    if (issuer.type !== 'POS_ADMIN') throw new ForbiddenException('Only a Restaurant Admin console can download the branch roster');
    return this.prisma.runAsTenant(issuer.restaurantId, async (tx) => {
      const scope = { restaurantId: issuer.restaurantId, ...(issuer.branchId ? { branchId: issuer.branchId } : {}) };
      const [devices, branches, restaurant, subs, restaurantBranchCount] = await Promise.all([
        tx.device.findMany({
          where: scope,
          select: { id: true, type: true, name: true, branchId: true, status: true, isLocked: true, deviceTokenHash: true }
        }),
        tx.branch.findMany({ where: { restaurantId: issuer.restaurantId, ...(issuer.branchId ? { id: issuer.branchId } : {}) }, select: { id: true, name: true, code: true, timezone: true, status: true } }),
        tx.restaurant.findUniqueOrThrow({ where: { id: issuer.restaurantId }, select: { id: true, name: true, status: true } }),
        tx.subscription.findMany({ where: { restaurantId: issuer.restaurantId, status: { in: ['ACTIVE', 'TRIAL'] }, expiresAt: { gt: new Date() } }, select: { id: true, expiresAt: true } }),
        // A branch-bound credential sees one branch even when the restaurant
        // has five. Cores need the total before attributing legacy null scope.
        tx.branch.count({ where: { restaurantId: issuer.restaurantId } })
      ]);
      const enabled = subs.length
        ? await tx.applicationEntitlement.findMany({ where: { subscriptionId: { in: subs.map((x) => x.id) }, enabled: true }, select: { appCode: true } })
        : [];
      const enabledApps = new Set<string>(enabled.map((e) => e.appCode));
      const branchApps = new Map<string, Set<string>>();
      for(const branch of branches){const allowed=new Set<string>();for(const appCode of enabledApps){const grant=await branchLicense(tx,issuer.restaurantId,branch.id,appCode as import('@prisma/client').AppCode);if(!grant||grant.enabled&&(!grant.expiresAt||grant.expiresAt>new Date()))allowed.add(appCode);}branchApps.set(branch.id,allowed);}
      const latestExpiry = subs.reduce<Date | null>((max, x) => (!max || x.expiresAt > max ? x.expiresAt : max), null);
      return {
        restaurant,
        branches,
        restaurantBranchCount,
        subscription: { active: subs.length > 0, expiresAt: latestExpiry?.toISOString() ?? null, enabledApps: [...enabledApps] },
        devices: devices.map((d) => ({
          id: d.id, type: d.type, name: d.name, branchId: d.branchId, status: d.status, isLocked: d.isLocked,
          tokenHash: d.deviceTokenHash, appEnabled: d.type === 'POS_ADMIN'
            ? ['POS_ADMIN','KIOSK_ADMIN','QR_ORDERING'].some(app => (d.branchId ? branchApps.get(d.branchId) : enabledApps)?.has(app)) : (d.branchId ? branchApps.get(d.branchId) : enabledApps)?.has(d.type) === true
        })),
        serverTime: new Date().toISOString()
      };
    });
  }

  /**
   * A Branch Core reporting on the devices it serves. Those devices talk to the core, not the cloud, so
   * this is how the cloud fleet view learns when they were last seen and what they have pending.
   * Restricted to the restaurant's own devices; a reported time is never accepted from the future.
   */
  async reportBranchDevices(
    issuer: Device,
    reports: Array<{ deviceId: string; lastSeenAt?: string | null; pendingSyncCount?: number; syncError?: string | null; appVersion?: string | null; menuVersion?: number | null; syncStatus?: string | null }>
  ) {
    if (issuer.type !== 'POS_ADMIN') throw new ForbiddenException('Only a Restaurant Admin console can report device status');
    const now = Date.now();
    return this.prisma.runAsTenant(issuer.restaurantId, async (tx) => {
      let updated = 0;
      for (const r of reports.slice(0, 500)) {
        const seen = r.lastSeenAt ? Math.min(Date.parse(r.lastSeenAt) || 0, now) : 0;
        const res = await tx.device.updateMany({
          where: { id: r.deviceId, restaurantId: issuer.restaurantId, ...(issuer.branchId ? { branchId: issuer.branchId } : {}), status: 'ACTIVE' },
          data: {
            ...(seen ? { lastSeenAt: new Date(seen) } : {}),
            ...(r.pendingSyncCount !== undefined ? { pendingSyncCount: r.pendingSyncCount } : {}),
            ...(r.syncError !== undefined ? { syncError: r.syncError } : {}),
            ...(r.appVersion ? { appVersion: r.appVersion } : {}),
            ...(r.menuVersion !== undefined && r.menuVersion !== null ? { menuVersion: r.menuVersion } : {}),
            ...(r.syncStatus ? { syncStatus: r.syncStatus } : {})
          }
        });
        updated += res.count;
      }
      return { updated };
    });
  }

  /** Restaurant Admin assigns (or clears) the kitchen station a KDS screen of its own restaurant serves. */
  async setKitchenStation(console: Device, targetId: string, station: string | null) {
    if (console.type !== 'POS_ADMIN') throw new ForbiddenException('Only Restaurant Admin can assign a kitchen station');
    return this.prisma.runAsTenant(console.restaurantId, async (tx) => {
      const target = await tx.device.findFirst({ where: { id: targetId, restaurantId: console.restaurantId, ...(console.branchId ? { branchId: console.branchId } : {}) } });
      if (!target) throw new NotFoundException('Device not found');
      if (target.type !== 'KDS') throw new BadRequestException('Only a KDS screen has a kitchen station');
      const updated = await tx.device.update({ where: { id: target.id }, data: { kitchenStation: station } });
      await this.audit.log({ actorType: 'TENANT', actorId: console.id, restaurantId: console.restaurantId, action: 'KDS_STATION_ASSIGNED', category: 'DEVICE', details: { deviceId: target.id, station } }, tx);
      return { id: updated.id, name: updated.name, kitchenStation: updated.kitchenStation };
    });
  }

  async listKiosksForRestaurant(restaurantId: string, branchId?: string | null) {
    const rows = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.device.findMany({
        where: { restaurantId, ...(branchId ? { branchId } : {}), type: 'KIOSK', status: { not: 'REVOKED' } },
        select: { id: true, name: true, status: true, lastSeenAt: true, appVersion: true, isLocked: true, lockReason: true, branch: { select: { name: true } } },
        orderBy: { createdAt: 'asc' }
      })
    );
    const now = new Date();
    return {
      kiosks: rows.map((d) => ({
        id: d.id,
        name: d.name ?? 'Kiosk',
        appVersion: d.appVersion,
        lastSeenAt: d.lastSeenAt,
        health: deviceHealth(d, now),
        isLocked: d.isLocked,
        lockReason: d.lockReason,
        branchName: d.branch?.name ?? null
      })),
      serverTime: now.toISOString()
    };
  }

  /**
   * B2-054: a terminal's restaurant profile (name/GSTIN/FSSAI/address) was adopted exactly once,
   * at activation, and never again — a Super Admin edit or a Restaurant Admin Settings save never
   * reached any terminal after that. Every activated device already authenticates itself here
   * (DeviceAuthGuard) for heartbeat/kiosk-list, so the same device credential is reused for both
   * directions of this sync instead of requiring a separate owner login, matching how every other
   * piece of restaurant-owned data (menu, staff, tables, shifts) already syncs through a device
   * token, not a tenant user session.
   */
  async getRestaurantIdentity(restaurantId: string, branchId?: string | null) {
    const restaurant = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.restaurant.findUniqueOrThrow({
        where: { id: restaurantId },
        select: { id: true, timezone: true, operatingProfile: true, brandingProfile: true, name: true, legalName: true, gstin: true, fssaiNumber: true, address: true, city: true, state: true, showJamanAi: true, businessDayCutoffHour: true, digestEnabled: true, digestHour: true, updatedAt: true }
      })
    );
    const { showJamanAi, ...rest } = restaurant;
    const branch = branchId ? await this.prisma.runAsTenant(restaurantId, tx => tx.branch.findFirst({ where: { id: branchId, restaurantId } })) : null;
    const current = activeProfile(restaurant.operatingProfile, { timezone: restaurant.timezone, cutoffHour: restaurant.businessDayCutoffHour });
    return { ...rest, operatingProfile: restaurant.operatingProfile ?? current, businessDayCutoffHour: current.cutoffHour, showJamanAI: showJamanAi, branding: restaurant.brandingProfile, branchId: branch?.id ?? null, branchOperatingProfile: branch?.operatingProfile ?? null, profileRevision: `${restaurant.updatedAt.getTime()}:${branch?.updatedAt.getTime() ?? 0}` };
  }

  async updateRestaurantIdentity(restaurantId: string, dto: RestaurantIdentityDto, actorId?: string) {
    const before = await this.getRestaurantIdentity(restaurantId);
    const current = activeProfile(before.operatingProfile, { timezone: before.timezone, cutoffHour: before.businessDayCutoffHour });
    const changed = dto.operatingProfile || (dto.businessDayCutoffHour !== undefined && dto.businessDayCutoffHour !== current.cutoffHour);
    const operatingProfile = changed ? scheduleProfile(current, dto.operatingProfile ?? { cutoffHour: dto.businessDayCutoffHour }) : undefined;
    await this.prisma.runAsTenant(restaurantId, async (tx) => {
      await tx.restaurant.update({
        where: { id: restaurantId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.legalName !== undefined ? { legalName: dto.legalName } : {}),
          ...(dto.gstin !== undefined ? { gstin: dto.gstin } : {}),
          ...(dto.fssaiNumber !== undefined ? { fssaiNumber: dto.fssaiNumber } : {}),
          ...(dto.address !== undefined ? { address: dto.address } : {}),
          ...(dto.city !== undefined ? { city: dto.city } : {}),
          ...(dto.state !== undefined ? { state: dto.state } : {}),
          ...(operatingProfile ? { operatingProfile } : {}),
          ...(dto.branding ? { brandingProfile: { ...(before.branding as object ?? {}), ...dto.branding } } : {}),
          ...(dto.showJamanAI !== undefined ? { showJamanAi: dto.showJamanAI } : {}),
          ...(dto.digestEnabled !== undefined ? { digestEnabled: dto.digestEnabled } : {}),
          ...(dto.digestHour !== undefined ? { digestHour: dto.digestHour } : {})
        }
      });
      await this.audit.log({actorType:'TENANT',actorId,restaurantId,action:'RESTAURANT_PROFILE_UPDATED',category:'SETTINGS',details:{fields:Object.keys(dto),operatingProfile:operatingProfile ?? null} as never},tx);
    });
    return this.getRestaurantIdentity(restaurantId);
  }

  async updateBranchOperatingProfile(device: Device, changes: { timezone?: string; cutoffHour?: number; effectiveFrom?: string; inherit?: boolean }) {
    if (!device.branchId) throw new BadRequestException('Select a branch before changing its operating profile');
    const before = await this.getRestaurantIdentity(device.restaurantId, device.branchId);
    const restaurantProfile = activeProfile(before.operatingProfile, { timezone: before.timezone, cutoffHour: before.businessDayCutoffHour });
    const current = activeProfile(before.branchOperatingProfile, restaurantProfile);
    const next = scheduleProfile(current, changes.inherit ? { ...restaurantProfile, inherit: true, effectiveFrom: changes.effectiveFrom } : changes);
    await this.prisma.runAsTenant(device.restaurantId, async tx => {
      await tx.branch.update({ where: { id: device.branchId! }, data: { operatingProfile: next } });
      await this.audit.log({actorType:'TENANT',actorId:(device as Device & {adminActorId?:string}).adminActorId,restaurantId:device.restaurantId,action:'BRANCH_OPERATING_PROFILE_UPDATED',category:'SETTINGS',details:{branchId:device.branchId,previous:before.branchOperatingProfile,next} as never},tx);
    });
    return this.getRestaurantIdentity(device.restaurantId, device.branchId);
  }

  async reportHeartbeat(device: Device, dto: HeartbeatDto) {
    const updated = await this.prisma.runAsTenant(device.restaurantId, (tx) =>
      tx.device.update({
        include: { branch: { select: { name: true, status: true } } },
        where: { id: device.id },
        data: {
          lastSeenAt: new Date(),
          ...(dto.lastSyncAt ? { lastSyncAt: dto.lastSyncAt } : {}),
          ...(dto.lastBackupAt ? { lastBackupAt: dto.lastBackupAt } : {}),
          ...(dto.syncStatus ? { syncStatus: dto.syncStatus } : {}),
          ...(dto.appVersion ? { appVersion: dto.appVersion } : {}),
          ...(dto.updateReport ? { updateReport: dto.updateReport } : {}),
          ...(dto.osPlatform ? { osPlatform: dto.osPlatform } : {}),
          ...(dto.ipAddress ? { ipAddress: dto.ipAddress } : {}),
          ...(dto.pendingSyncCount !== undefined ? { pendingSyncCount: dto.pendingSyncCount } : {}),
          ...(dto.profileRevision !== undefined ? { profileRevision: dto.profileRevision } : {}),
          ...(dto.menuVersion !== undefined ? { menuVersion: dto.menuVersion } : {}),
          // null clears a previous error once the terminal recovers.
          ...(dto.syncError !== undefined ? { syncError: dto.syncError } : {})
        }
      })
    );
    const branchInactive = !!updated.branch && updated.branch.status !== 'ACTIVE';
    const [update, extension, restaurant, captainHandlesService] = await Promise.all([
      this.latestUpdateFor(updated.type, updated.appVersion, updated.osPlatform),
      this.activeExtensionFor(updated),
      this.prisma.runAsTenant(device.restaurantId, (tx) => tx.restaurant.findUnique({ where: { id: device.restaurantId }, select: { displayScalePercent: true } })),
      device.type === 'KDS' ? this.prisma.runAsTenant(device.restaurantId, async tx => {
        const entitled = await tx.applicationEntitlement.findFirst({where:{restaurantId:device.restaurantId,appCode:'CAPTAIN',enabled:true,subscription:{status:{in:['ACTIVE','TRIAL']},expiresAt:{gt:new Date()}}},select:{id:true}});
        if (!entitled) return false;
        return !!(await tx.device.findFirst({where:{restaurantId:device.restaurantId,branchId:device.branchId,type:'CAPTAIN',status:'ACTIVE'},select:{id:true}}));
      }) : undefined
    ]);
    // Only what the terminal needs. This used to return the whole device row,
    // including the stored credential hash.
    return {
      ok: true,
      serverTime: new Date().toISOString(),
      restaurantId: device.restaurantId,
      branchId: device.branchId,
      deviceId: device.id,
      // The station this KDS screen was assigned by Restaurant Admin (null: it chooses).
      station: updated.kitchenStation ?? null,
      // Service handoff follows this branch's actual Captain deployment, not a seeded local PRO license.
      ...(captainHandlesService !== undefined ? { captainHandlesService } : {}),
      // A deactivated branch locks its terminals just as an MDM lock does (BUG-048).
      locked: updated.isLocked || branchInactive,
      lockCode: updated.isLocked ? 'DEVICE_LOCKED' : branchInactive ? 'BRANCH_INACTIVE' : null,
      lockReason: updated.isLocked ? updated.lockReason ?? null : branchInactive ? `Branch "${updated.branch!.name}" has been deactivated.` : null,
      // What the platform team wants every restaurant screen to say right now (maintenance, etc.).
      // A targeted announcement (as opposed to maintenance) only reaches POS / Kiosk / Restaurant Admin.
      notice: await readActivePlatformNotice(this.prisma, new Date(), updated.type),
      // A newer stable release for this terminal's app, or null when it is current (BUG-065).
      update,
      // The signed emergency offline extension that applies to this terminal, if any (BUG-077).
      extension,
      // The restaurant's default display size; a terminal may override it locally (BUG-008).
      displayScalePercent: restaurant?.displayScalePercent ?? 100
    };
  }
}
