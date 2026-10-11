import { PrismaService } from '../prisma/prisma.service';

export interface PlatformNotice {
  kind: 'MAINTENANCE' | 'ANNOUNCEMENT';
  message: string;
  startsAt: string | null;
  endsAt: string | null;
}

// B2-010: used to say "...Your terminals keep working offline." and the UI banner appended its own
// fixed "Billing is not affected. Your terminals keep working." right after it, with no separating
// space and the same claim said twice. Shortened so the two pieces no longer overlap in meaning.
const DEFAULT_MESSAGE = 'The platform is under scheduled maintenance.';

/** The three device types an "announcement" (as opposed to a platform-wide maintenance notice) can target. */
export type AnnouncementTargetApp = 'POS' | 'KIOSK' | 'POS_ADMIN';

function activeAnnouncementFor(
  value: { enabled?: boolean; message?: string; targetApps?: string[]; startsAt?: string | null; endsAt?: string | null } | null | undefined,
  deviceType: string | undefined,
  now: Date
): PlatformNotice | null {
  if (!value || value.enabled !== true) return null;
  const targetApps = value.targetApps ?? [];
  if (deviceType && !targetApps.includes(deviceType)) return null;

  const startsAt = value.startsAt ? new Date(value.startsAt) : null;
  const endsAt = value.endsAt ? new Date(value.endsAt) : null;
  if (startsAt && startsAt > now) return null;
  if (endsAt && endsAt <= now) return null;

  const message = (value.message ?? '').trim();
  if (!message) return null;

  return { kind: 'ANNOUNCEMENT', message, startsAt: startsAt ? startsAt.toISOString() : null, endsAt: endsAt ? endsAt.toISOString() : null };
}

/**
 * The announcement a restaurant app should show right now, or null. A `platform.maintenance`
 * notice (global, all five terminal apps) always wins when active. Otherwise, if `deviceType` is
 * given and a `platform.announcement` is active and targets that device type, that is shown
 * instead -- a lighter-weight announcement scoped to POS / Kiosk / Restaurant Admin only, distinct
 * from the "the platform is down" tone of maintenance mode.
 */
export async function readActivePlatformNotice(prisma: PrismaService, now: Date = new Date(), deviceType?: string): Promise<PlatformNotice | null> {
  const [maintenanceSetting, announcementSetting] = await Promise.all([
    prisma.runAsPlatform((tx) => tx.platformSetting.findUnique({ where: { key: 'platform.maintenance' } })),
    prisma.runAsPlatform((tx) => tx.platformSetting.findUnique({ where: { key: 'platform.announcement' } }))
  ]);

  const v = (maintenanceSetting?.value ?? {}) as { maintenanceMode?: boolean; statusBanner?: string; startsAt?: string | null; endsAt?: string | null };
  if (v.maintenanceMode === true) {
    const startsAt = v.startsAt ? new Date(v.startsAt) : null;
    const endsAt = v.endsAt ? new Date(v.endsAt) : null;
    const inWindow = !(startsAt && startsAt > now) && !(endsAt && endsAt <= now);
    if (inWindow) {
      return {
        kind: 'MAINTENANCE',
        message: (v.statusBanner ?? '').trim() || DEFAULT_MESSAGE,
        startsAt: startsAt ? startsAt.toISOString() : null,
        endsAt: endsAt ? endsAt.toISOString() : null
      };
    }
  }

  return activeAnnouncementFor(
    announcementSetting?.value as { enabled?: boolean; message?: string; targetApps?: string[]; startsAt?: string | null; endsAt?: string | null } | null,
    deviceType,
    now
  );
}
