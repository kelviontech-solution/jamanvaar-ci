import { describe, it, expect } from 'vitest';

/**
 * Proves the REAL production nav data (not a fixture standing in for it) gates sections
 * correctly against the real production entitlements model: a restaurant holds one
 * subscription per product family (RESTAURANT vs KIOSK), and pos-admin is the single admin
 * app for both. A Kiosk-only subscriber (POS_ADMIN not enabled) must not see -- not even
 * read-only -- the restaurant floor-service screens (Billing, Orders, Tables, Menu, Staff,
 * Payments, etc.) they never paid for; those are gated on 'POS_ADMIN'. Account-level/shared
 * infrastructure (Coupons, Reports, Printers, Sync, Settings, Subscription Plans, Audit,
 * Backup, Support) and the Dashboard landing page stay visible regardless of plan.
 */
describe('pos-admin NAV_SECTIONS gating (real data)', () => {
  const RESTAURANT_ONLY_IDS = [
    'BILLING_SALES',
    'ORDERS',
    'LIVE_KDS',
    'TABLES',
    'RESERVATIONS',
    'KITCHEN_KOT',
    'MENU',
    'MENU_OPTIONS',
    'INVENTORY',
    'INVENTORY_CONTROL',
    'CUSTOMERS',
    'STAFF',
    'PAYMENTS',
    'SHIFTS'
  ];

  const SHARED_IDS = [
    'DASHBOARD',
    'COUPONS',
    'REPORTS',
    'HARDWARE',
    'RECEIPTS',
    'SYNC',
    'SETTINGS',
    'LICENSE',
    'AUDIT',
    'BACKUP',
    'SUPPORT'
  ];

  it('Kiosk Terminals is entirely absent when KIOSK_ADMIN is not enabled -- not present-but-disabled', async () => {
    const { NAV_SECTIONS } = await import('../apps/restaurant-system/pos-admin/src/navSections');
    const { filterNavSections } = await import('../apps/restaurant-system/pos-admin/src/hooks/useEntitlements');

    const filtered = filterNavSections(NAV_SECTIONS, () => false);
    const allIds = filtered.flatMap((g) => g.items.map((i) => i.id));

    expect(allIds).not.toContain('KIOSKS');
    expect(filtered.some((g) => g.section === 'KIOSK')).toBe(false);
  }, 60000);

  it('Kiosk Terminals is present when KIOSK_ADMIN is enabled', async () => {
    const { NAV_SECTIONS } = await import('../apps/restaurant-system/pos-admin/src/navSections');
    const { filterNavSections } = await import('../apps/restaurant-system/pos-admin/src/hooks/useEntitlements');

    const filtered = filterNavSections(NAV_SECTIONS, (app) => app === 'KIOSK_ADMIN');
    const allIds = filtered.flatMap((g) => g.items.map((i) => i.id));

    expect(allIds).toContain('KIOSKS');
  }, 60000);

  it('a Kiosk-only subscriber (POS_ADMIN off, KIOSK_ADMIN on) sees Kiosk Terminals and shared items but none of the Restaurant-only screens', async () => {
    const { NAV_SECTIONS } = await import('../apps/restaurant-system/pos-admin/src/navSections');
    const { filterNavSections } = await import('../apps/restaurant-system/pos-admin/src/hooks/useEntitlements');

    const filtered = filterNavSections(NAV_SECTIONS, (app) => app === 'KIOSK_ADMIN');
    const allIds = filtered.flatMap((g) => g.items.map((i) => i.id));

    for (const id of RESTAURANT_ONLY_IDS) {
      expect(allIds).not.toContain(id);
    }
    for (const id of SHARED_IDS) {
      expect(allIds).toContain(id);
    }
    expect(allIds).toContain('KIOSKS');
  }, 60000);

  it('a Restaurant-only subscriber (POS_ADMIN on, KIOSK_ADMIN off) sees every Restaurant-only screen and shared items but not Kiosk Terminals', async () => {
    const { NAV_SECTIONS } = await import('../apps/restaurant-system/pos-admin/src/navSections');
    const { filterNavSections } = await import('../apps/restaurant-system/pos-admin/src/hooks/useEntitlements');

    const filtered = filterNavSections(NAV_SECTIONS, (app) => app === 'POS_ADMIN');
    const allIds = filtered.flatMap((g) => g.items.map((i) => i.id));

    for (const id of RESTAURANT_ONLY_IDS) {
      expect(allIds).toContain(id);
    }
    for (const id of SHARED_IDS) {
      expect(allIds).toContain(id);
    }
    expect(allIds).not.toContain('KIOSKS');
  }, 60000);

  it('a restaurant holding both subscriptions (POS_ADMIN and KIOSK_ADMIN) sees every item', async () => {
    const { NAV_SECTIONS } = await import('../apps/restaurant-system/pos-admin/src/navSections');
    const { filterNavSections } = await import('../apps/restaurant-system/pos-admin/src/hooks/useEntitlements');

    const filtered = filterNavSections(NAV_SECTIONS, (app) => app === 'POS_ADMIN' || app === 'KIOSK_ADMIN');
    const allIds = filtered.flatMap((g) => g.items.map((i) => i.id));
    const totalItemsInSource = NAV_SECTIONS.flatMap((g) => g.items.map((i) => i.id));

    expect(allIds.sort()).toEqual(totalItemsInSource.sort());
  }, 60000);

  it('shared items are unaffected when both POS_ADMIN and KIOSK_ADMIN are off', async () => {
    const { NAV_SECTIONS } = await import('../apps/restaurant-system/pos-admin/src/navSections');
    const { filterNavSections } = await import('../apps/restaurant-system/pos-admin/src/hooks/useEntitlements');

    const filtered = filterNavSections(NAV_SECTIONS, () => false);
    const allIds = filtered.flatMap((g) => g.items.map((i) => i.id));

    for (const id of SHARED_IDS) {
      expect(allIds).toContain(id);
    }
  }, 60000);
});
