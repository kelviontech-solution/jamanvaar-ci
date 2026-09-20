import { describe, it, expect } from 'vitest';
import { deviceHealth, DEGRADED_WITHIN_MS, ONLINE_WITHIN_MS } from './device-health';

/**
 * BUG-067/069: three pages used three different "online" rules (15 minutes, 1 hour, and a 15-second
 * heartbeat), and "offline" was total minus online, so revoked and never-activated devices inflated
 * it. One rule, computed on the server, with revoked / pending / never-seen as their own states.
 */
describe('deviceHealth', () => {
  const now = new Date('2026-09-20T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it('a device that checked in recently is online', () => {
    expect(deviceHealth({ status: 'ACTIVE', lastSeenAt: ago(30_000) }, now)).toBe('online');
    expect(deviceHealth({ status: 'ACTIVE', lastSeenAt: ago(ONLINE_WITHIN_MS) }, now)).toBe('online');
  });

  it('a device that missed a few heartbeats is degraded, not offline yet', () => {
    expect(deviceHealth({ status: 'ACTIVE', lastSeenAt: ago(ONLINE_WITHIN_MS + 1) }, now)).toBe('degraded');
    expect(deviceHealth({ status: 'ACTIVE', lastSeenAt: ago(DEGRADED_WITHIN_MS) }, now)).toBe('degraded');
  });

  it('a device silent for longer is offline', () => {
    expect(deviceHealth({ status: 'ACTIVE', lastSeenAt: ago(DEGRADED_WITHIN_MS + 1) }, now)).toBe('offline');
    expect(deviceHealth({ status: 'ACTIVE', lastSeenAt: ago(3 * 24 * 3600_000) }, now)).toBe('offline');
  });

  it('revoked, pending and never-seen devices are their own states, never "offline"', () => {
    expect(deviceHealth({ status: 'REVOKED', lastSeenAt: ago(10 * 3600_000) }, now)).toBe('revoked');
    expect(deviceHealth({ status: 'PENDING', lastSeenAt: null }, now)).toBe('pending');
    expect(deviceHealth({ status: 'ACTIVE', lastSeenAt: null }, now)).toBe('never_seen');
  });
});
