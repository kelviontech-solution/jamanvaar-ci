import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// A tiny in-memory localStorage (this repo's vitest environment is 'node') holding a fake
// device token -- fetchCloudKiosks goes through deviceFetch, which requires one to exist.
vi.hoisted(() => {
  const data = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    get length() { return data.size; }
  } as Storage;
});

describe('pos-admin kiosk fleet client', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    localStorage.setItem('jamanvaar_cloud_device_token', 'test-device-token');
  });
  afterEach(() => { global.fetch = originalFetch; });

  it('filters the device fleet down to KIOSK-type devices', async () => {
    global.fetch = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({
          devices: [
            { id: 'd1', type: 'KIOSK', name: 'Front Kiosk', appVersion: '1.2.0', lastSeenAt: null, lastSyncAt: null, health: 'online', isLocked: false, lockReason: null, pendingSyncCount: 0, syncError: null, branch: null },
            { id: 'd2', type: 'POS_ADMIN', name: 'Owner laptop', appVersion: '1.2.0', lastSeenAt: null, lastSyncAt: null, health: 'online', isLocked: false, lockReason: null, pendingSyncCount: 0, syncError: null, branch: null }
          ]
        }), { status: 200, headers: { 'content-type': 'application/json' } })
    ) as unknown as typeof fetch;

    const { fetchCloudKiosks } = await import('../apps/restaurant-system/pos-admin/src/cloud/cloudClient');
    const kiosks = await fetchCloudKiosks();
    expect(kiosks).toHaveLength(1);
    expect(kiosks[0].id).toBe('d1');
  }, 60000);
});
