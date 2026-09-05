import { describe, expect, it } from 'vitest';
import { validateCoupon } from '../packages/business/src/coupons';
import { Coupon } from '../packages/types/src/domain';

describe('Coupon Validation & Discount Logic', () => {
  const coupon: Coupon = {
    id: 'cpn-test',
    code: 'FEAST20',
    description: '20% OFF',
    discountType: 'PERCENTAGE',
    discountValue: 20,
    minOrderValue: 500,
    maxDiscountAmount: 120,
    validFrom: '2026-01-01T00:00:00Z',
    validUntil: '2027-12-31T23:59:59Z',
    usageLimit: 1000,
    usageCount: 10,
    isActive: true
  };

  it('rejects coupon when subtotal is below minimum requirement', () => {
    const result = validateCoupon(coupon, 400);
    expect(result.isValid).toBe(false);
    expect(result.discountAmount).toBe(0);
  });

  it('calculates percentage discount when above minimum', () => {
    const result = validateCoupon(coupon, 550);
    expect(result.isValid).toBe(true);
    expect(result.discountAmount).toBe(110); // 20% of 550 = 110
  });

  it('caps discount at maxDiscountAmount', () => {
    const result = validateCoupon(coupon, 1000);
    expect(result.isValid).toBe(true);
    expect(result.discountAmount).toBe(120); // capped at 120
  });
});
