import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Platform Payments' KPI grid had a 6th <Card> with nothing in it at all -- just an empty
 * padded div next to "Successful Payments", rendering as a blank white box with no label or
 * value. PlatformSummary only ever carried 5 metrics (grossVolume, platformCommission,
 * restaurantShare, refundedAmount, successfulCount) plus statusCounts (already shown in its
 * own card below), so there was never a 6th metric to fill it with -- dead leftover markup,
 * removed rather than filled with something invented.
 */
const SRC = join(__dirname, '../cloud/super-admin-web/src/pages/PlatformPayments/PlatformPaymentsDashboardPage.tsx');

describe('Platform Payments: no empty KPI card in the summary grid', () => {
  it('the grid has no bare <Card><div style={{ padding: 16 }}></div></Card>', () => {
    const src = readFileSync(SRC, 'utf8');
    expect(src).not.toMatch(/<Card>\s*<div style=\{\{ padding: 16 \}\}>\s*<\/div>\s*<\/Card>/);
  });
});
