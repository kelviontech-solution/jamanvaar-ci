import { describe, it, expect } from 'vitest';
import { PRODUCT_PAGES } from '../apps/restaurant-system/pos-admin/src/adminProducts';

describe('kiosk payment settings belong to the kiosk product only', () => {
  it('the restaurant (POS) admin product has no kiosk payments page', () => {
    expect(Object.keys(PRODUCT_PAGES.POS_ADMIN)).not.toContain('KIOSK_PAYMENTS');
  });

  it('the kiosk product still has the kiosk payments page', () => {
    expect(PRODUCT_PAGES.KIOSK_ADMIN.KIOSK_PAYMENTS).toBe('payments');
  });
});
