import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Device, Prisma, PlatformUser } from '@prisma/client';
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
  osPlatform?: string;
  pendingSyncCount?: number;
  syncError?: string | null;
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
    const attention: Prisma.DeviceWhereInput[] =
      query.needsAttention === 'true'
        ? [{ OR: [healthWhere('offline', now), healthWhere('degraded', now), { status: 'ACTIVE', syncError: { not: null } }] as Prisma.DeviceWhereInput[] }]
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
          COUNT(*) FILTER (WHERE d.status = 'ACTIVE' AND (d."lastSeenAt" < ${ts(online)} OR d."syncError" IS NOT NULL))::int AS "needsAttention"
        FROM "Restaurant" r
        JOIN "Device" d ON d."restaurantId" = r.id
        WHERE r."deletedAt" IS NULL AND (${like}::text IS NULL OR r.name ILIKE ${like})
        GROUP BY r.id, r.name
        ORDER BY "needsAttention" DESC, r.name ASC
        LIMIT ${limit} OFFSET ${offset}
      `);
      if (!paging.paged) return rows;
      const totalRows = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
        SELECT COUNT(DISTINCT r.id)::int AS n FROM "Restaurant" r JOIN "Device" d ON d."restaurantId" = r.id
        WHERE r."deletedAt" IS NULL AND (${like}::text IS NULL OR r.name ILIKE ${like})
      `);
      return pageOf(rows, totalRows[0]?.n ?? 0, paging);
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
    return device;
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

      return updated;
    });
  }

  private static readonly APP_CODE_FOR_DEVICE: Record<string, string> = {
    POS: 'POS', POS_ADMIN: 'RESTAURANT_ADMIN', CAPTAIN: 'CAPTAIN', KDS: 'KDS', KIOSK: 'KIOSK', KIOSK_ADMIN: 'KIOSK_ADMIN'
  };

  /** The newest STABLE release of the terminal's own app, as an offer relative to the version it runs. */
  private async latestUpdateFor(deviceType: string, currentVersion: string | null) {
    const releases = await this.prisma.runAsPlatform((tx) =>
      tx.appRelease.findMany({ where: { appCode: DevicesService.APP_CODE_FOR_DEVICE[deviceType] ?? deviceType, channel: 'STABLE' } })
    );
    // Versions compare numerically, so pick the newest in code rather than trusting a database sort.
    const newest = releases.sort((a, b) => compareVersions(b.version, a.version))[0] ?? null;
    return updateFor(currentVersion, newest);
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
  async listKiosksForRestaurant(restaurantId: string) {
    const rows = await this.prisma.runAsTenant(restaurantId, (tx) =>
      tx.device.findMany({
        where: { restaurantId, type: 'KIOSK', status: { not: 'REVOKED' } },
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
          ...(dto.osPlatform ? { osPlatform: dto.osPlatform } : {}),
          ...(dto.ipAddress ? { ipAddress: dto.ipAddress } : {}),
          ...(dto.pendingSyncCount !== undefined ? { pendingSyncCount: dto.pendingSyncCount } : {}),
          // null clears a previous error once the terminal recovers.
          ...(dto.syncError !== undefined ? { syncError: dto.syncError } : {})
        }
      })
    );
    const branchInactive = !!updated.branch && updated.branch.status !== 'ACTIVE';
    const [update, extension, restaurant] = await Promise.all([
      this.latestUpdateFor(updated.type, updated.appVersion),
      this.activeExtensionFor(updated),
      this.prisma.runAsTenant(device.restaurantId, (tx) => tx.restaurant.findUnique({ where: { id: device.restaurantId }, select: { displayScalePercent: true } }))
    ]);
    // Only what the terminal needs. This used to return the whole device row,
    // including the stored credential hash.
    return {
      ok: true,
      serverTime: new Date().toISOString(),
      // A deactivated branch locks its terminals just as an MDM lock does (BUG-048).
      locked: updated.isLocked || branchInactive,
      lockCode: updated.isLocked ? 'DEVICE_LOCKED' : branchInactive ? 'BRANCH_INACTIVE' : null,
      lockReason: updated.isLocked ? updated.lockReason ?? null : branchInactive ? `Branch "${updated.branch!.name}" has been deactivated.` : null,
      // What the platform team wants every restaurant screen to say right now (maintenance, etc.).
      notice: await readActivePlatformNotice(this.prisma),
      // A newer stable release for this terminal's app, or null when it is current (BUG-065).
      update,
      // The signed emergency offline extension that applies to this terminal, if any (BUG-077).
      extension,
      // The restaurant's default display size; a terminal may override it locally (BUG-008).
      displayScalePercent: restaurant?.displayScalePercent ?? 100
    };
  }
}
