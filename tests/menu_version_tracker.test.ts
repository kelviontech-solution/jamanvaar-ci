import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MenuVersionTracker } from '../packages/sync/src/menu_version';
import { buildHeartbeatBody } from '../packages/sync/src/heartbeat';

const store = new Map<string, string>();
const CURSOR = (t: string) => `jamanvaar_entity_sync_cursor_${t}`;

describe('MenuVersionTracker', () => {
  const original = (globalThis as any).localStorage;
  beforeEach(() => {
    store.clear();
    (globalThis as any).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k)
    };
  });
  afterEach(() => { (globalThis as any).localStorage = original; });

  const latest = (version: number, watermark: string | null) => async () => ({ version, watermark });

  it('a device that has never pulled the menu has applied nothing', async () => {
    await MenuVersionTracker.refresh(latest(3, '2026-09-25T10:00:00.000Z'));
    expect(MenuVersionTracker.applied()).toBe(0);
  });

  it('applied once both menu cursors are at or past the publish moment', async () => {
    store.set(CURSOR('MENU_ITEM'), '2026-09-25T10:00:05.000Z');
    store.set(CURSOR('MENU_CATEGORY'), '2026-09-25T10:00:01.000Z');
    await MenuVersionTracker.refresh(latest(3, '2026-09-25T10:00:00.000Z'));
    expect(MenuVersionTracker.applied()).toBe(3);
  });

  it('not applied while one of the two menu collections is still behind the publish', async () => {
    store.set(CURSOR('MENU_ITEM'), '2026-09-25T10:00:05.000Z');
    store.set(CURSOR('MENU_CATEGORY'), '2026-09-25T09:59:00.000Z');
    await MenuVersionTracker.refresh(latest(4, '2026-09-25T10:00:00.000Z'));
    expect(MenuVersionTracker.applied()).toBe(0);
  });

  it('never goes backwards, and ignores a restaurant that has published nothing', async () => {
    store.set(CURSOR('MENU_ITEM'), '2026-09-25T11:00:00.000Z');
    store.set(CURSOR('MENU_CATEGORY'), '2026-09-25T11:00:00.000Z');
    await MenuVersionTracker.refresh(latest(5, '2026-09-25T10:00:00.000Z'));
    await MenuVersionTracker.refresh(latest(2, '2026-09-25T09:00:00.000Z'));
    expect(MenuVersionTracker.applied()).toBe(5);
    store.clear();
    await MenuVersionTracker.refresh(latest(0, null));
    expect(MenuVersionTracker.applied()).toBe(0);
  });

  it('a failure to reach the server keeps the last known value', async () => {
    store.set('jamanvaar_menu_applied_version', '7');
    await MenuVersionTracker.refresh(async () => { throw new Error('offline'); });
    expect(MenuVersionTracker.applied()).toBe(7);
  });

  it('the heartbeat reports the applied menu version', () => {
    store.set('jamanvaar_menu_applied_version', '9');
    expect(buildHeartbeatBody('1.0.0').menuVersion).toBe(9);
  });
});
