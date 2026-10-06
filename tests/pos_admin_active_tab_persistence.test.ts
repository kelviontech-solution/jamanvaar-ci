import { describe, it, expect } from 'vitest';

/**
 * pos-admin has no client-side router -- activeTab is a plain useState, so refreshing the
 * browser always reset to DASHBOARD regardless of which tab (Kiosk or Restaurant) was open.
 * Reported as "Kiosk Admin reverts to Restaurant Admin on refresh" -- the real cause is simpler
 * and not Kiosk-specific: no tab was ever persisted, for anyone. restoreActiveTab is the pure
 * function the real production tab list is validated through, so this proves the fix against
 * the real data (ALL_POS_ADMIN_TABS), not a fixture standing in for it.
 */
describe('pos-admin active tab persistence (refresh-loses-tab fix)', () => {
  it('restores a previously-saved valid tab', async () => {
    const { restoreActiveTab } = await import('../apps/restaurant-system/pos-admin/src/App');
    expect(restoreActiveTab('KIOSKS')).toBe('KIOSKS');
    expect(restoreActiveTab('KIOSK_DESIGN')).toBe('KIOSK_DESIGN');
    expect(restoreActiveTab('BILLING_SALES')).toBe('BILLING_SALES');
  });

  it('falls back to DASHBOARD when nothing was saved yet', async () => {
    const { restoreActiveTab } = await import('../apps/restaurant-system/pos-admin/src/App');
    expect(restoreActiveTab(null)).toBe('DASHBOARD');
  });

  it('falls back to DASHBOARD for a stale/unknown value (e.g. a removed tab id from an old build)', async () => {
    const { restoreActiveTab } = await import('../apps/restaurant-system/pos-admin/src/App');
    expect(restoreActiveTab('SOME_REMOVED_TAB_FROM_AN_OLD_BUILD')).toBe('DASHBOARD');
    expect(restoreActiveTab('')).toBe('DASHBOARD');
  });

  it('every real production tab id round-trips through restoreActiveTab unchanged', async () => {
    const { restoreActiveTab, ALL_POS_ADMIN_TABS } = await import('../apps/restaurant-system/pos-admin/src/App');
    for (const tab of ALL_POS_ADMIN_TABS) {
      expect(restoreActiveTab(tab)).toBe(tab);
    }
  });
}, 60000);
