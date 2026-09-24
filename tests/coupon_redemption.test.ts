import { describe, it, expect, beforeEach } from 'vitest';
import { db, CouponRepository } from '@jamanvaar/database';
import type { Coupon } from '@jamanvaar/types';

/**
 * B2-064: `Coupon.usageLimit`/`usageCount`/`validFrom`/`validUntil` all existed on the type, and
 * `incrementUsage` wrote to `usageCount` on every redemption, but `getByCode` never read any of
 * them back — a coupon could be redeemed unlimited times, by unlimited guests, forever, even past
 * its own expiry date. `getByCode` now enforces all three.
 */
describe('CouponRepository.getByCode enforces usage limit and validity window (B2-064)', () => {
  const base: Coupon = {
    id: 'cpn-test',
    code: 'TESTCODE',
    description: 'Test coupon',
    discountType: 'FLAT',
    discountValue: 50,
    minOrderValue: 100,
    validFrom: '2020-01-01T00:00:00Z',
    validUntil: '2099-12-31T23:59:59Z',
    usageCount: 0,
    isActive: true
  };

  beforeEach(() => {
    db.resetToDefaultSeed();
    db.coupons = db.coupons.filter((c) => c.code !== 'TESTCODE');
  });

  it('returns a valid, unexpired, under-limit coupon normally', () => {
    CouponRepository.createCoupon({ ...base, usageLimit: 5, usageCount: 2 });
    expect(CouponRepository.getByCode('TESTCODE')?.code).toBe('TESTCODE');
  });

  it('is case-insensitive on the code, as before', () => {
    CouponRepository.createCoupon({ ...base });
    expect(CouponRepository.getByCode('testcode')?.code).toBe('TESTCODE');
  });

  it('refuses a coupon that has reached its usage limit', () => {
    CouponRepository.createCoupon({ ...base, usageLimit: 5, usageCount: 5 });
    expect(CouponRepository.getByCode('TESTCODE')).toBeUndefined();
  });

  it('refuses a coupon that has exceeded its usage limit', () => {
    CouponRepository.createCoupon({ ...base, usageLimit: 5, usageCount: 9 });
    expect(CouponRepository.getByCode('TESTCODE')).toBeUndefined();
  });

  it('a coupon with no usageLimit at all is treated as unlimited, regardless of usageCount', () => {
    CouponRepository.createCoupon({ ...base, usageCount: 500_000 });
    expect(CouponRepository.getByCode('TESTCODE')?.code).toBe('TESTCODE');
  });

  it('refuses a coupon whose validUntil has already passed', () => {
    CouponRepository.createCoupon({ ...base, validUntil: '2020-06-01T00:00:00Z' });
    expect(CouponRepository.getByCode('TESTCODE')).toBeUndefined();
  });

  it('refuses a coupon whose validFrom is still in the future', () => {
    CouponRepository.createCoupon({ ...base, validFrom: '2099-01-01T00:00:00Z' });
    expect(CouponRepository.getByCode('TESTCODE')).toBeUndefined();
  });

  it('incrementUsage still increments usageCount, and the coupon stops resolving once it crosses the limit', () => {
    CouponRepository.createCoupon({ ...base, usageLimit: 2, usageCount: 0 });
    expect(CouponRepository.getByCode('TESTCODE')).toBeDefined();
    CouponRepository.incrementUsage('TESTCODE');
    expect(CouponRepository.getByCode('TESTCODE')).toBeDefined(); // 1/2 used, still valid
    CouponRepository.incrementUsage('TESTCODE');
    expect(CouponRepository.getByCode('TESTCODE')).toBeUndefined(); // 2/2 used, exhausted
  });

  it('the seeded WELCOME50 coupon (usageLimit 10000, usageCount 42) still resolves normally', () => {
    expect(CouponRepository.getByCode('WELCOME50')?.code).toBe('WELCOME50');
  });
});
