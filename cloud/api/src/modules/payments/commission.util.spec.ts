import { describe, it, expect } from 'vitest';
import { splitCommission, DEFAULT_COMMISSION_BPS } from './commission.util';

describe('splitCommission (the platform/restaurant fee split, used by every payment and by the manual payout batch)', () => {
  it('the 3% default always leaves platformAmount + restaurantAmount == grossAmount exactly, for the spec\'s own example table', () => {
    const cases: Array<{ gross: number; fee: number; net: number }> = [
      { gross: 100, fee: 3, net: 97 }, // ₹1
      { gross: 1000, fee: 30, net: 970 }, // ₹10
      { gross: 9900, fee: 297, net: 9603 }, // ₹99
      { gross: 10000, fee: 300, net: 9700 }, // ₹100
      { gross: 99900, fee: 2997, net: 96903 }, // ₹999
      { gross: 100000, fee: 3000, net: 97000 }, // ₹1,000
      { gross: 1000000, fee: 30000, net: 970000 } // ₹10,000
    ];
    for (const c of cases) {
      const { platformAmount, restaurantAmount } = splitCommission(c.gross, DEFAULT_COMMISSION_BPS);
      expect(platformAmount).toBe(c.fee);
      expect(restaurantAmount).toBe(c.net);
      expect(platformAmount + restaurantAmount).toBe(c.gross);
    }
  });

  it('is never off by a paise for amounts with no clean 3% split', () => {
    for (const gross of [1, 3, 7, 11, 33, 67, 101, 333, 1001, 12345, 999999]) {
      const { platformAmount, restaurantAmount } = splitCommission(gross, 300);
      expect(platformAmount + restaurantAmount).toBe(gross);
      expect(Number.isInteger(platformAmount)).toBe(true);
      expect(Number.isInteger(restaurantAmount)).toBe(true);
    }
  });

  it('a 0% commission leaves the full gross with the restaurant, and 100% leaves none', () => {
    expect(splitCommission(10000, 0)).toEqual({ platformAmount: 0, restaurantAmount: 10000 });
    expect(splitCommission(10000, 10000)).toEqual({ platformAmount: 10000, restaurantAmount: 0 });
  });
});
