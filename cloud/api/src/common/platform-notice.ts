import { PrismaService } from '../prisma/prisma.service';

export interface PlatformNotice {
  kind: 'MAINTENANCE';
  message: string;
  startsAt: string | null;
  endsAt: string | null;
}

const DEFAULT_MESSAGE = 'The platform is under scheduled maintenance. Your terminals keep working offline.';

/**
 * The announcement a restaurant app should show right now, or null. Built from the
 * `platform.maintenance` setting: the switch must be on, and if a start and/or end
 * time is set, "now" must fall inside that window.
 */
export async function readActivePlatformNotice(prisma: PrismaService, now: Date = new Date()): Promise<PlatformNotice | null> {
  const setting = await prisma.runAsPlatform((tx) => tx.platformSetting.findUnique({ where: { key: 'platform.maintenance' } }));
  const v = (setting?.value ?? {}) as { maintenanceMode?: boolean; statusBanner?: string; startsAt?: string | null; endsAt?: string | null };
  if (v.maintenanceMode !== true) return null;

  const startsAt = v.startsAt ? new Date(v.startsAt) : null;
  const endsAt = v.endsAt ? new Date(v.endsAt) : null;
  if (startsAt && startsAt > now) return null;
  if (endsAt && endsAt <= now) return null;

  return {
    kind: 'MAINTENANCE',
    message: (v.statusBanner ?? '').trim() || DEFAULT_MESSAGE,
    startsAt: startsAt ? startsAt.toISOString() : null,
    endsAt: endsAt ? endsAt.toISOString() : null
  };
}
