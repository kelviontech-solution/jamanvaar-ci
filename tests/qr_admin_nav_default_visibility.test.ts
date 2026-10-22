import { describe, expect, it } from 'vitest';
import { filterQrNavigation, QR_PAGES, QR_GROUP_ORDER } from '../apps/restaurant-system/pos-admin/src/components/qrconsole/qrNavigation';
describe('QR navigation shows every page directly', () => {
  it('keeps website, payments, guests and setup in the sidebar without a hidden tools mode', () => {
    const ids = filterQrNavigation('').map(page => page.id);
    expect(ids).toEqual(expect.arrayContaining(['RESTAURANT_PAGE','WEBSITE_QR','PAYMENTS','CRM','ADVANCED','DESIGN','PICKUP','SETTINGS','PERFORMANCE']));
    expect(ids).toHaveLength(QR_PAGES.length);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('finds engagement subpages and recovers every page after clearing search', () => {
    expect(filterQrNavigation(' feedback ').map(page => page.id)).toContain('ADVANCED');
    expect(filterQrNavigation('Collections').map(page => page.id)).toContain('ADVANCED');
    expect(filterQrNavigation('something-not-a-page')).toEqual([]);
    expect(filterQrNavigation('')).toHaveLength(QR_PAGES.length);
  });
  it('groups every page into the seven owner workspaces without losing direct access', () => {
    expect([...new Set(filterQrNavigation('').map(page => page.group))]).toEqual(QR_GROUP_ORDER);
    expect(QR_PAGES.find(page => page.id === 'OVERVIEW')?.label).toBe('Today');
    expect(QR_PAGES.filter(page => ['ACCEPTANCE','RECONCILIATION','PAYMENTS','RECEIPTS'].includes(page.id)).every(page => page.group === 'Payments')).toBe(true);
  });
});
