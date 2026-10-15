import { describe, it, expect } from 'vitest';
import { PRODUCT_PAGES, canAccessAdminPage } from '../apps/restaurant-system/pos-admin/src/adminProducts';

describe('kiosk payment settings belong to the kiosk product only', () => {
  it('unified restaurant console permits kiosk payments only with a kiosk management grant', () => {
    expect(canAccessAdminPage(['POS_ADMIN'], 'POS_ADMIN','KIOSK_PAYMENTS')).toBe(false);
    expect(canAccessAdminPage(['POS_ADMIN','KIOSK_ADMIN'], 'POS_ADMIN','KIOSK_PAYMENTS')).toBe(true);
    expect(PRODUCT_PAGES.POS_ADMIN.KIOSK_PAYMENTS).not.toBe(PRODUCT_PAGES.POS_ADMIN.PAYMENTS);
  });

  it('the kiosk product still has the kiosk payments page', () => {
    expect(PRODUCT_PAGES.KIOSK_ADMIN.KIOSK_PAYMENTS).toBe('payments');
  });
});
