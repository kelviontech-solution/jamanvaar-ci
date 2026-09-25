import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildHeartbeatBody } from '../packages/sync/src/heartbeat';
import { db } from '../packages/database/src/db';

class Failing {
  getItem() { return null; }
  setItem() { throw Object.assign(new Error('disk full'), { name: 'QuotaExceededError' }); }
  removeItem() {}
}

describe('heartbeat reports real device health', () => {
  let original: unknown;
  beforeEach(() => {
    original = (globalThis as any).localStorage;
    (globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    db.resetToDefaultSeed();
    db.orders.length = 0;
    db.syncEvents.length = 0;
  });
  afterEach(() => {
    (globalThis as any).localStorage = original;
    db.orders.length = 0;
  });

  it('is ok when nothing is wrong', () => {
    const body = buildHeartbeatBody('1.0.0');
    expect(body.syncStatus).toBe('ok');
    expect(body.syncError).toBeNull();
  });

  it('flags dead-lettered orders as an error the operator must act on', () => {
    db.orders.push({ id: 'dl-1', syncStatus: 'DEAD_LETTER' } as never);
    const body = buildHeartbeatBody('1.0.0');
    expect(body.syncStatus).toBe('error');
    expect(body.syncError).toMatch(/1 .*gave up|dead/i);
  });

  it('flags a failing local store, which means recent changes exist only in memory', () => {
    (globalThis as any).localStorage = new Failing();
    db.notify();
    const body = buildHeartbeatBody('1.0.0');
    expect(body.syncStatus).toBe('error');
    expect(body.syncError).toMatch(/local storage/i);
  });
});
