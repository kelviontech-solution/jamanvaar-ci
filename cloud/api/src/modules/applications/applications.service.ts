import { ConflictException, Injectable } from '@nestjs/common';
import { DeviceType, PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PublishReleaseDto } from './dto/application.dto';

export interface AppMetadata {
  code: string;
  name: string;
  category: string;
  deviceType?: DeviceType;
  description: string;
  defaultPort?: number;
}

export const APP_CATALOG: AppMetadata[] = [
  {
    code: 'POS',
    name: 'Counter POS & Fast Billing',
    category: 'Counter & Cashier',
    deviceType: 'POS',
    description: '100% offline-first billing terminal, ESC/POS printing, token routing, and GST invoices.',
    defaultPort: 5173
  },
  {
    code: 'RESTAURANT_ADMIN',
    name: 'Restaurant Admin Portal',
    category: 'Back-Office & Operations',
    deviceType: 'POS_ADMIN',
    description: 'Complete organization administration, menu editor, floor plan, reports, and cloud sync.',
    defaultPort: 5176
  },
  {
    code: 'CAPTAIN',
    name: 'Captain App (Table-Side)',
    category: 'Service & Waiters',
    deviceType: 'CAPTAIN',
    description: 'Wireless table ordering, instant course firing, food ready alerts, and waiter metrics.',
    defaultPort: 5174
  },
  {
    code: 'KDS',
    name: 'Kitchen Display System (KDS)',
    category: 'Kitchen & Production',
    deviceType: 'KDS',
    description: 'Multi-station prep routing, order queue timing, cook alert cards, and bump bar support.',
    defaultPort: 5175
  },
  {
    code: 'KIOSK',
    name: 'Self-Ordering Kiosk',
    category: 'Customer Self-Service',
    deviceType: 'KIOSK',
    description: 'Visual digital catalog, custom modifiers, UPI BharatQR display, and self-checkout.',
    defaultPort: 5178
  },
  {
    code: 'KIOSK_ADMIN',
    name: 'Kiosk Terminal Admin',
    category: 'Hardware & Terminal Config',
    description: 'Kiosk peripheral configuration, terminal lock screen, and display branding.',
    defaultPort: 5177
  }
];

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

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      return APP_CATALOG.map((meta) => {
        const releases = allReleases.filter((r) => r.appCode === meta.code);
        const latestRelease = releases[0] || null;

        const matchingDevices = meta.deviceType
          ? allDevices.filter((d) => d.type === meta.deviceType)
          : [];

        const activeDevices = matchingDevices.filter((d) => d.status === 'ACTIVE').length;
        const onlineDevices = matchingDevices.filter(
          (d) => d.status === 'ACTIVE' && d.lastSeenAt && new Date(d.lastSeenAt) > oneHourAgo
        ).length;

        return {
          ...meta,
          currentVersion: latestRelease?.version || '1.0.0',
          channel: latestRelease?.channel || 'STABLE',
          minSupportedVersion: latestRelease?.minSupportedVersion || null,
          supportedPlatforms: (latestRelease?.supportedPlatforms as string[]) || ['web'],
          downloadUrl: latestRelease?.downloadUrl || null,
          releaseNotes: latestRelease?.releaseNotes || null,
          releasedAt: latestRelease?.releasedAt || null,
          totalDevices: matchingDevices.length,
          activeDevices,
          onlineDevices,
          offlineDevices: activeDevices - onlineDevices,
          recentReleases: releases.slice(0, 5)
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
          downloadUrl: dto.downloadUrl,
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
