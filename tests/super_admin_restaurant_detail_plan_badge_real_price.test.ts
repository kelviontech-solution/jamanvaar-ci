import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Restaurant Detail's header badge hardcoded "PRO PLAN (₹7,000)" / "CORE PLAN (₹5,000)" regardless
 * of the restaurant's actual subscription price -- e.g. a restaurant on JAMANVAAR PRO at ₹580/mo
 * (confirmed live via the Onboard Restaurant wizard) showed "PRO PLAN (₹7,000)" in the header, a
 * fabricated number contradicting the correct price shown elsewhere on the same page (activeSub.plan.priceMonthly,
 * used correctly at the Subscription tab). Fixed by reading the real plan name/price off activeSub.plan
 * instead of a hardcoded tier->price map.
 */
const SRC = join(__dirname, '../cloud/super-admin-web/src/pages/Restaurants/RestaurantDetailPage.tsx');

describe('Restaurant Detail: header plan badge shows the real subscription price, not a hardcoded one', () => {
  const src = readFileSync(SRC, 'utf8');

  it('does not hardcode PRO PLAN (₹7,000) / CORE PLAN (₹5,000)', () => {
    expect(src).not.toMatch(/PRO PLAN \(₹7,000\)/);
    expect(src).not.toMatch(/CORE PLAN \(₹5,000\)/);
  });

  it('the header badge derives its price from activeSub.plan.priceMonthly', () => {
    const headerSection = src.slice(src.indexOf("{/* Header */}"), src.indexOf("{/* Header */}") + 2000);
    expect(headerSection).toMatch(/activeSub\?\.plan/);
    expect(headerSection).toMatch(/priceMonthly/);
  });
});
