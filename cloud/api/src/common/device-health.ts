/**
 * The single definition of a terminal's health, used by every list and summary (BUG-067/069).
 * Terminals send a heartbeat about every 15 seconds; browsers throttle background timers to about a
 * minute, so "online" allows a couple of minutes of slack. Revoked, pending and never-seen devices
 * are reported as themselves so they never inflate the offline count.
 */
export const ONLINE_WITHIN_MS = 2 * 60 * 1000;
export const DEGRADED_WITHIN_MS = 15 * 60 * 1000;

/** A terminal locks itself after this many days without reaching the cloud, unless an emergency extension covers it (packages/sync DEFAULT_OFFLINE_GRACE_DAYS). */
export const OFFLINE_GRACE_DAYS = 7;
/** Terminals are flagged as "approaching" once they have been silent this long. */
export const OFFLINE_WARN_AFTER_DAYS = 4;

export type DeviceHealth = 'online' | 'degraded' | 'offline' | 'revoked' | 'pending' | 'never_seen';

export function deviceHealth(device: { status: string; lastSeenAt: Date | null }, now: Date = new Date()): DeviceHealth {
  if (device.status === 'REVOKED') return 'revoked';
  if (device.status === 'PENDING') return 'pending';
  if (!device.lastSeenAt) return 'never_seen';
  const silentFor = now.getTime() - device.lastSeenAt.getTime();
  if (silentFor <= ONLINE_WITHIN_MS) return 'online';
  if (silentFor <= DEGRADED_WITHIN_MS) return 'degraded';
  return 'offline';
}

/** Where clause fragments (by lastSeenAt) for each health state of an ACTIVE device, for database-side filtering and counting. */
export function healthWhere(health: DeviceHealth, now: Date = new Date()) {
  const t = (ms: number) => new Date(now.getTime() - ms);
  switch (health) {
    case 'online': return { status: 'ACTIVE' as const, lastSeenAt: { gte: t(ONLINE_WITHIN_MS) } };
    case 'degraded': return { status: 'ACTIVE' as const, lastSeenAt: { lt: t(ONLINE_WITHIN_MS), gte: t(DEGRADED_WITHIN_MS) } };
    case 'offline': return { status: 'ACTIVE' as const, lastSeenAt: { lt: t(DEGRADED_WITHIN_MS) } };
    case 'never_seen': return { status: 'ACTIVE' as const, lastSeenAt: null };
    case 'revoked': return { status: 'REVOKED' as const };
    case 'pending': return { status: 'PENDING' as const };
  }
}
