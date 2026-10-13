import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reported "UI is not okay" on Restaurant Health & Risk: the "Why" column joins up to five
 * reason strings ("38/41 terminals offline or unseen", "6 unresolved sync conflicts", ...)
 * with ' · ' into one unbroken string. With no width cap or wrap on that column, and no
 * table-layout: fixed, a long combined reason forces the table wider than its card, squeezing
 * Restaurant/Score/Status into a thin sliver -- a real layout break on restaurants with many
 * reasons, which production has plenty of.
 */
const SRC = join(__dirname, '../cloud/super-admin-web/src/pages/RestaurantHealth/RestaurantHealthPage.tsx');

describe('Super Admin: Restaurant Health "Why" column does not blow out the table layout', () => {
  const src = readFileSync(SRC, 'utf8');

  it('fixes the table layout so columns keep a stable share of the width', () => {
    const idx = src.indexOf('<table');
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/tableLayout:\s*'fixed'/);
  });

  it('caps the Why column width and lets its text wrap instead of overflowing', () => {
    const idx = src.indexOf("{r.reasons.length === 0 ? '—' : r.reasons.join(' · ')}");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx - 300, idx);
    expect(block).toMatch(/whiteSpace:\s*'normal'/);
    expect(block).toMatch(/wordBreak|overflowWrap/);
  });
});
