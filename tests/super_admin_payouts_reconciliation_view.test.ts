import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Super Admin feature request: settlement reconciliation view -- "why is this restaurant's money
 * stuck" in one place, found while tracing the earlier "Pending payout shows money the batch can
 * never claim" bug (same session, same root cause: nothing on the Payouts page explained *why* a
 * restaurant's collection wasn't moving). reconciliationBoard() classifies every restaurant with
 * unpaid money into BANK_NOT_VERIFIED, READY_FOR_NEXT_BATCH, or ONLY_BLOCKED_TRANSACTIONS and the
 * new GET /api/v1/payments/payouts/reconciliation route + Payouts page panel surface it.
 */
const SERVICE = join(__dirname, '../cloud/api/src/modules/payments/restaurant-payouts.service.ts');
const CONTROLLER = join(__dirname, '../cloud/api/src/modules/payments/restaurant-payouts.controller.ts');
const PAGE = join(__dirname, '../cloud/super-admin-web/src/pages/Payouts/PayoutsListPage.tsx');

describe('Restaurant Payouts: settlement reconciliation view', () => {
  it('reconciliationBoard classifies a restaurant with unverified bank as BANK_NOT_VERIFIED even if it has claimable money', () => {
    const src = readFileSync(SERVICE, 'utf8');
    const block = src.slice(src.indexOf('async reconciliationBoard'));
    expect(block).toMatch(/!bankVerified\s*\n?\s*\?\s*'BANK_NOT_VERIFIED'/);
  });

  it('the reconciliation route is registered before the :id route so it is not swallowed by it', () => {
    const src = readFileSync(CONTROLLER, 'utf8');
    const reconciliationIdx = src.indexOf("@Get('reconciliation')");
    const detailIdx = src.indexOf("@Get(':id')");
    expect(reconciliationIdx).toBeGreaterThan(-1);
    expect(detailIdx).toBeGreaterThan(-1);
    expect(reconciliationIdx).toBeLessThan(detailIdx);
  });

  it('the Payouts page only renders the reconciliation panel when there is something to explain', () => {
    const src = readFileSync(PAGE, 'utf8');
    expect(src).toMatch(/reconciliation\s*&&\s*reconciliation\.length\s*>\s*0/);
  });
});
