import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Menu Performance's "Cost" / "Profit" columns (table and CSV export) always rendered the literal
 * string "Unavailable" -- there is no cost-per-dish data wired in anywhere in this app, so the
 * column could never show a real number. A column that can never be populated looks like a broken
 * feature rather than one that was never built; removed until real cost tracking exists.
 */
const SRC = join(__dirname, '../apps/restaurant-system/pos-admin/src/components/qrconsole/QrOperations.tsx');

describe('Menu Performance: no permanently-"Unavailable" Cost/Profit column', () => {
  const src = readFileSync(SRC, 'utf8');

  it('the CSV export no longer has Cost/Profit header or value columns', () => {
    expect(src).not.toMatch(/"Cost",\s*\n\s*"Profit",/);
    expect(src).not.toMatch(/"Unavailable",\s*\n\s*"Unavailable",/);
  });

  it('the on-screen table no longer has a Cost / profit header or an "Unavailable" cell', () => {
    expect(src).not.toMatch(/"Cost \/ profit"/);
    expect(src).not.toMatch(/<td>Unavailable<\/td>/);
  });
});
