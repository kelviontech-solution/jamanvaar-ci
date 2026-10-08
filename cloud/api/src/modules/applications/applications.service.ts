import { ConflictException, Injectable } from '@nestjs/common';
import { AppCode, DeviceType, PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PublishReleaseDto } from './dto/application.dto';

export interface AppMetadata {
  code: string;
  name: string;
  category: string;
  deviceType?: DeviceType;
  // The AppRelease/APP_CATALOG `code` predates ApplicationEntitlement and
  // uses 'RESTAURANT_ADMIN' where the entitlement schema's AppCode enum
  // uses 'POS_ADMIN' for the same application — this is the bridge between
  // the two rather than a silent rename of already-seeded release data.
  entitlementAppCode: AppCode;
  description: string;
  defaultPort?: number;
}

export const APP_CATALOG: AppMetadata[] = [
  {
    code: 'POS',
    name: 'Counter POS & Fast Billing',
    category: 'Counter & Cashier',
    deviceType: 'POS',
    entitlementAppCode: 'POS',
    description: '100% offline-first billing terminal, ESC/POS printing, token routing, and GST invoices.',
    defaultPort: 5175
  },
  {
    code: 'RESTAURANT_ADMIN',
    name: 'Restaurant Admin Portal',
    category: 'Back-Office & Operations',
    deviceType: 'POS_ADMIN',
    entitlementAppCode: 'POS_ADMIN',
    description: 'Complete organization administration, menu editor, floor plan, reports, and cloud sync.',
    defaultPort: 5176
  },
  {
    code: 'CAPTAIN',
    name: 'Captain App (Table-Side)',
    category: 'Service & Waiters',
    deviceType: 'CAPTAIN',
    entitlementAppCode: 'CAPTAIN',
    description: 'Wireless table ordering, instant course firing, food ready alerts, and waiter metrics.',
    defaultPort: 5177
  },
  {
    code: 'KDS',
    name: 'Kitchen Display System (KDS)',
    category: 'Kitchen & Production',
    deviceType: 'KDS',
    entitlementAppCode: 'KDS',
    description: 'Multi-station prep routing, order queue timing, cook alert cards, and bump bar support.',
    defaultPort: 5179
  },
  {
    code: 'KIOSK',
    name: 'Self-Ordering Kiosk',
    category: 'Customer Self-Service',
    deviceType: 'KIOSK',
    entitlementAppCode: 'KIOSK',
    description: 'Visual digital catalog, custom modifiers, UPI BharatQR display, and self-checkout.',
    defaultPort: 5174
  },
  {
    code: 'KIOSK_ADMIN',
    name: 'Kiosk Terminal Admin',
    category: 'Hardware & Terminal Config',
    // Fix: this row previously had no deviceType at all, so its device
    // counts were structurally hardcoded to zero (matchingDevices below is
    // `meta.deviceType ? ... : []`) no matter how many real Kiosk Admin
    // terminals existed — there was no DeviceType value for it to match
    // against either (added in the same migration as ApplicationEntitlement).
    deviceType: 'KIOSK_ADMIN',
    entitlementAppCode: 'KIOSK_ADMIN',
    description: 'Kiosk device fleet management, menu/branch assignment, availability, and order monitoring.',
    defaultPort: 5173
  }
];

import { compareVersions } from '../../common/version';
import { deviceHealth } from '../../common/device-health';

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list() {
    return this.prisma.runAsPlatform(async (tx) => {
      const allReleases = await tx.appRelease.findMany({
        orderBy: { releasedAt: 'desc' }
      });

      const allDevices = await tx.device.findMany({
        select: { type: true, status: true, lastSeenAt: true, appVersion: true }
      });

      // Real per-app entitlement counts — previously this endpoint reported
      // nothing about which/how many restaurants actually have an app
      // enabled, only device telemetry.
      const enabledEntitlements = await tx.applicationEntitlement.findMany({
        where: { enabled: true },
        select: { appCode: true, restaurantId: true }
      });

      const now = new Date();

      return APP_CATALOG.map((meta) => {
        const releases = allReleases.filter((r) => r.appCode === meta.code);
        // The newest STABLE release by version number (2.10.0 is newer than 2.9.0), not by publish time.
        const latestRelease = releases.filter((r) => r.channel === 'STABLE').sort((a, b) => compareVersions(b.version, a.version))[0] || null;

        const matchingDevices = meta.deviceType
          ? allDevices.filter((d) => d.type === meta.deviceType)
          : [];

        const activeDevices = matchingDevices.filter((d) => d.status === 'ACTIVE').length;
        // The same health rule as the fleet page (common/device-health.ts).
        const health = matchingDevices.map((d) => deviceHealth(d, now));
        const onlineDevices = health.filter((h) => h === 'online').length;
        const degradedDevices = health.filter((h) => h === 'degraded').length;
        const offlineDevices = health.filter((h) => h === 'offline').length;
        const neverSeenDevices = health.filter((h) => h === 'never_seen').length;
        // Terminals running something older than the newest stable release (or that never reported a version).
        const behindDevices = latestRelease
          ? matchingDevices.filter((d) => d.status === 'ACTIVE' && compareVersions(d.appVersion, latestRelease.version) < 0).length
          : 0;

        const assignedRestaurantIds = new Set(
          enabledEntitlements.filter((e) => e.appCode === meta.entitlementAppCode).map((e) => e.restaurantId)
        );

        return {
          ...meta,
          // null when nothing has been published: never an invented version number.
          currentVersion: latestRelease?.version ?? null,
          channel: latestRelease?.channel || 'STABLE',
          minSupportedVersion: latestRelease?.minSupportedVersion || null,
          supportedPlatforms: (latestRelease?.supportedPlatforms as string[]) || ['web'],
          downloadUrls: (latestRelease?.downloadUrls as Record<string, string>) || null,
          releaseNotes: latestRelease?.releaseNotes || null,
          releasedAt: latestRelease?.releasedAt || null,
          totalDevices: matchingDevices.length,
          activeDevices,
          onlineDevices,
          degradedDevices,
          offlineDevices,
          neverSeenDevices,
          behindDevices,
          assignedRestaurants: assignedRestaurantIds.size,
          recentReleases: releases.slice(0, 5)
        };
      });
    });
  }

  /**
   * A restaurant's own read of the app catalog and its current downloadable version — same
   * release lookup as list(), but stripped of platform-wide fleet/device/entitlement counts,
   * which belong to Super Admin only and are meaningless (or a cross-tenant data leak) to a
   * single restaurant's admin console.
   */
  async listForTenant() {
    return this.prisma.runAsPlatform(async (tx) => {
      const allReleases = await tx.appRelease.findMany({
        orderBy: { releasedAt: 'desc' }
      });

      return APP_CATALOG.map((meta) => {
        const releases = allReleases.filter((r) => r.appCode === meta.code);
        const latestRelease = releases.filter((r) => r.channel === 'STABLE').sort((a, b) => compareVersions(b.version, a.version))[0] || null;

        return {
          code: meta.code,
          name: meta.name,
          category: meta.category,
          description: meta.description,
          currentVersion: latestRelease?.version ?? null,
          supportedPlatforms: (latestRelease?.supportedPlatforms as string[]) || ['web'],
          downloadUrls: (latestRelease?.downloadUrls as Record<string, string>) || null,
          releaseNotes: latestRelease?.releaseNotes || null,
          releasedAt: latestRelease?.releasedAt || null
        };
      });
    });
  }

  async getReleases(appCode: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      return tx.appRelease.findMany({
        where: { appCode },
        orderBy: { releasedAt: 'desc' }
      });
    });
  }

  async publishRelease(dto: PublishReleaseDto, actor: PlatformUser) {
    return this.prisma.runAsPlatform(async (tx) => {
      const existing = await tx.appRelease.findUnique({
        where: { appCode_version: { appCode: dto.appCode, version: dto.version } }
      });
      if (existing) {
        throw new ConflictException(`Version ${dto.version} already exists for ${dto.appCode}`);
      }

      const release = await tx.appRelease.create({
        data: {
          appCode: dto.appCode,
          version: dto.version,
          channel: dto.channel,
          minSupportedVersion: dto.minSupportedVersion,
          supportedPlatforms: dto.supportedPlatforms,
          releaseNotes: dto.releaseNotes,
          downloadUrls: dto.downloadUrls,
          isMandatory: dto.isMandatory
        }
      });

      await this.audit.log(
        {
          actorType: 'PLATFORM',
          actorId: actor.id,
          action: 'APP_RELEASE_PUBLISHED',
          category: 'APPLICATIONS',
          details: { appCode: dto.appCode, version: dto.version, channel: dto.channel }
        },
        tx
      );

      return release;
    });
  }
}
