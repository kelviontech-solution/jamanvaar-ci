import { describe, it, expect, vi, afterEach } from 'vitest';

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

describe('pos-admin fetchMyEnabledApps', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  // Same cold-dynamic-import cost as tests/pos_admin_payment_connection_client.test.ts — see its
  // comment. Matching timeout for the same reason.
  it('returns the enabledApps list from the response body', async () => {
    global.fetch = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ enabledApps: ['POS', 'POS_ADMIN', 'KIOSK_ADMIN'] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
    ) as unknown as typeof fetch;

    const { fetchMyEnabledApps } = await import('../apps/restaurant-system/pos-admin/src/cloud/cloudClient');
    const apps = await fetchMyEnabledApps();
    expect(apps).toEqual(['POS', 'POS_ADMIN', 'KIOSK_ADMIN']);
  }, 60000);
});

describe('filterNavSections (pure gating logic)', () => {
  const sections = [
    {
      section: 'OPERATIONS',
      items: [
        { id: 'DASHBOARD', label: 'Dashboard' },
        { id: 'KIOSKS', label: 'Kiosk Terminals', requiresApp: 'KIOSK_ADMIN' as const }
      ]
    },
    {
      section: 'KIOSK ONLY',
      items: [{ id: 'KIOSK_SETTINGS', label: 'Kiosk Settings', requiresApp: 'KIOSK_ADMIN' as const }]
    }
  ];

  it('drops a gated item entirely (not just visually) when hasApp is false for it', async () => {
    const { filterNavSections } = await import('../apps/restaurant-system/pos-admin/src/hooks/useEntitlements');
    const filtered = filterNavSections(sections, () => false);
    const ids = filtered.flatMap((g) => g.items.map((i) => i.id));
    expect(ids).toEqual(['DASHBOARD']);
  });

  it('drops an entire section when every one of its items is gated off', async () => {
    const { filterNavSections } = await import('../apps/restaurant-system/pos-admin/src/hooks/useEntitlements');
    const filtered = filterNavSections(sections, () => false);
    expect(filtered.map((g) => g.section)).toEqual(['OPERATIONS']);
  });

  it('keeps a gated item when hasApp is true for it', async () => {
    const { filterNavSections } = await import('../apps/restaurant-system/pos-admin/src/hooks/useEntitlements');
    const filtered = filterNavSections(sections, (app) => app === 'KIOSK_ADMIN');
    const ids = filtered.flatMap((g) => g.items.map((i) => i.id));
    expect(ids).toEqual(['DASHBOARD', 'KIOSKS', 'KIOSK_SETTINGS']);
  });

  it('never filters an item with no requiresApp key', async () => {
    const { filterNavSections } = await import('../apps/restaurant-system/pos-admin/src/hooks/useEntitlements');
    const filtered = filterNavSections(sections, () => false);
    expect(filtered[0].items.some((i) => i.id === 'DASHBOARD')).toBe(true);
  });
});
