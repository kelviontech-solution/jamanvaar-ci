import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Today combines the live attention feed with configuration issues. Keep a direct
 * route from each problem to the order or setup screen that can resolve it.
 */
const SRC = join(__dirname, '../apps/restaurant-system/pos-admin/src/components/qrconsole/QrConsole.tsx');

describe('Overview: a real "needs attention today" panel, not just static tiles', () => {
  const src = readFileSync(SRC, 'utf8');
  const overviewFn = /function Overview\(\{ navigate \}[\s\S]*?(?=\nfunction TablesAndQr)/.exec(src)?.[0] ?? '';

  it('surfaces orders waiting/in the kitchen as an actionable link to QR Orders, not just a tile', () => {
    expect(src).toMatch(/<QrOrderAttention branchId=\{editingScope.branchId\}/);
    expect(src).toMatch(/searchParams.set\('order',id\)/);
    expect(src).toMatch(/await navigate\('ORDERS'\)/);
  });

  it('surfaces tables without an active QR code as an actionable link to Tables & QR', () => {
    expect(overviewFn).toMatch(/missingCodes = Math.max\(0, data\.tables - data\.activeCodes\)/);
    expect(overviewFn).toMatch(/missingCodes > 0/);
    expect(overviewFn).toMatch(/navigate\('TABLES'\)/);
  });

  it('Overview receives navigate from its caller instead of reaching for global state', () => {
    expect(src).toMatch(/function Overview\(\{\s*navigate\s*\}/);
    expect(src).toMatch(/<Overview navigate=\{navigate\}/);
  });
});
