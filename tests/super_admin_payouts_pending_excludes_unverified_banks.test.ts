import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Restaurant Payouts' "Pending payout" KPI summed every restaurant's unbatched SUCCESS collections,
 * with no filter on bank-verification status. But runEodBatch() only creates a payout for a
 * restaurant with an ACTIVE connection and VERIFIED bank details (see runEodBatch's own query at
 * the top of this file) -- a restaurant that hasn't verified its bank yet is silently skipped.
 * Confirmed live: Super Admin saw "Pending payout ₹2.91", ran the EOD batch, and got 0 payouts
 * created with no explanation, because the only restaurant with money sitting unbatched had never
 * verified its bank account. Fixed by restricting the "unbatched" aggregate that feeds pendingPayout
 * to restaurants with an ACTIVE + VERIFIED connection, the same eligibility runEodBatch already uses,
 * so the KPI never promises money the batch cannot actually claim.
 */
const SRC = join(__dirname, '../cloud/api/src/modules/payments/restaurant-payouts.service.ts');

describe('Restaurant Payouts: "Pending payout" only counts bank-verified restaurants\' collections', () => {
  const src = readFileSync(SRC, 'utf8');

  it('collectionSummary looks up which restaurants have an ACTIVE + VERIFIED bank connection', () => {
    const summarySection = src.slice(src.indexOf('private async collectionSummary'));
    expect(summarySection).toMatch(/bankVerificationStatus:\s*['"]VERIFIED['"]/);
    expect(summarySection).toMatch(/verifiedRestaurantIds/);
  });

  it('the unbatched aggregate that feeds pendingPayout is restricted to those verified restaurant ids', () => {
    const summarySection = src.slice(src.indexOf('private async collectionSummary'), src.indexOf('pendingPayoutBeforeRefunds'));
    const unbatchedLine = summarySection.split('\n').find((l) => l.includes('const unbatched =') || /\bunbatched\b.*aggregate/.test(l));
    const unbatchedBlock = summarySection.slice(summarySection.indexOf('unbatched'), summarySection.indexOf('unbatched') + 400);
    expect(unbatchedBlock).toMatch(/restaurantId:\s*\{\s*in:\s*verifiedRestaurantIds\s*\}/);
  });
});
