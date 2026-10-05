import { describe, it, expect } from 'vitest';

/**
 * Task 9: proves the REAL production nav data (not a fixture standing in for it) gates the
 * Kiosk Terminals item correctly -- this is what makes the entitlement gate real, not just the
 * filterNavSections function in isolation (already covered by tests/pos_admin_entitlements.test.ts).
 */
describe('pos-admin NAV_SECTIONS gating (real data)', () => {
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

  it('every other nav item (ungated) is unaffected by KIOSK_ADMIN being off', async () => {
    const { NAV_SECTIONS } = await import('../apps/restaurant-system/pos-admin/src/navSections');
    const { filterNavSections } = await import('../apps/restaurant-system/pos-admin/src/hooks/useEntitlements');

    const withoutKiosk = filterNavSections(NAV_SECTIONS, () => false).flatMap((g) => g.items.map((i) => i.id));
    const totalItemsInSource = NAV_SECTIONS.flatMap((g) => g.items.map((i) => i.id));
    const nonKioskItems = totalItemsInSource.filter((id) => id !== 'KIOSKS');

    expect(withoutKiosk.sort()).toEqual(nonKioskItems.sort());
  }, 60000);
});
