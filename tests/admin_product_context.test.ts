import { describe, expect, it } from 'vitest';
import { availableAdminProducts, adminPagePath, parseAdminRoute, readAdminPreference, resolveAdminRoute, PRODUCT_PAGES } from '../apps/restaurant-system/pos-admin/src/adminProducts';
import { productNavSections } from '../apps/restaurant-system/pos-admin/src/navSections';
import { filterNavSections } from '../apps/restaurant-system/pos-admin/src/hooks/useEntitlements';

describe('shared owner platform, separate authorized application contexts', () => {
  it('does not confuse customer kiosks or kitchen/captain terminals with owner consoles', () => {
    expect(availableAdminProducts(['KIOSK', 'KDS', 'CAPTAIN', 'POS'])).toEqual([]);
    expect(availableAdminProducts(['KIOSK_ADMIN'])).toEqual(['KIOSK_ADMIN']);
  });
  it('auto-opens the sole enabled console at the legacy entry without pretending it is Restaurant Admin', () => {
    expect(resolveAdminRoute(parseAdminRoute('/pos-admin/'), ['KIOSK_ADMIN'], {})).toEqual({ product: 'KIOSK_ADMIN', page: 'DASHBOARD', invalid: false });
  });
  it('offers a chooser with two products and no saved preference', () => {
    expect(resolveAdminRoute(parseAdminRoute('/'), ['POS_ADMIN', 'KIOSK_ADMIN'], {}).product).toBeNull();
  });
  it('restores a valid remembered product/page, never a disabled product', () => {
    const saved = readAdminPreference('{"product":"KIOSK_ADMIN","pages":{"KIOSK_ADMIN":"KIOSK_DESIGN"}}');
    expect(resolveAdminRoute(parseAdminRoute('/'), ['POS_ADMIN', 'KIOSK_ADMIN'], saved).page).toBe('KIOSK_DESIGN');
    expect(resolveAdminRoute(parseAdminRoute('/'), ['POS_ADMIN'], saved).product).toBe('POS_ADMIN');
  });
  it('gives explicit URLs priority over preferences, leaving unauthorized routes for the access-denied screen', () => {
    const route = parseAdminRoute('/kiosk-admin/terminals');
    expect(resolveAdminRoute(route, ['POS_ADMIN'], { product: 'POS_ADMIN' })).toEqual(route);
  });
  it.each(['/kiosk-admin/missing', '/kiosk-admin/menu/extra', '/kiosk-admin/inventory', '/random', '/restaurant-admin/appearance'])('fails closed for %s', path => {
    expect(parseAdminRoute(path).invalid).toBe(true);
  });
  it.each(['POS_ADMIN', 'KIOSK_ADMIN'] as const)('all real %s routes round-trip without collision', product => {
    for (const page of Object.keys(PRODUCT_PAGES[product]) as Array<keyof typeof PRODUCT_PAGES.POS_ADMIN>) {
      expect(parseAdminRoute(adminPagePath(product, page))).toEqual({ product, page, invalid: false });
    }
  });
  it('does not accept a poisoned storage object as permissions or page IDs', () => {
    expect(readAdminPreference('{"product":"SUPER_ADMIN","pages":{"KIOSK_ADMIN":"INVENTORY","POS_ADMIN":"prototype"}}')).toEqual({ product: undefined, pages: {} });
    expect(readAdminPreference('null')).toEqual({});
  });
  it('each kiosk page is reachable through its own real navigation and no restaurant-only page is exposed', () => {
    const ids = filterNavSections(productNavSections('KIOSK_ADMIN'), app => app === 'KIOSK_ADMIN').flatMap(group => group.items.map(item => item.id));
    expect(new Set(ids)).toEqual(new Set(Object.keys(PRODUCT_PAGES.KIOSK_ADMIN)));
    expect(ids).not.toContain('INVENTORY'); expect(ids).not.toContain('BILLING_SALES');
    expect(ids).toContain('STAFF'); expect(ids).toContain('KIOSK_PAYMENTS');
  });
  it('restaurant navigation excludes kiosk appearance, terminals and settlement screens even on combined plans', () => {
    const ids = filterNavSections(productNavSections('POS_ADMIN'), () => true).flatMap(group => group.items.map(item => item.id));
    expect(ids).not.toContain('KIOSKS'); expect(ids).not.toContain('KIOSK_DESIGN'); expect(ids).not.toContain('KIOSK_PAYMENTS');
  });
  it('does not build links to a different product page accidentally', () => {
    expect(() => adminPagePath('KIOSK_ADMIN', 'INVENTORY')).toThrow();
  });
});
