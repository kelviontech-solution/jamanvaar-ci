import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Overview used to be a static dashboard -- numbers an owner had to read and interpret themselves
 * every time. It now surfaces the two things that actually need action today, using data it
 * already loads (no new API calls): orders waiting in the kitchen, and tables without an active
 * QR code, each linking straight to the page that fixes it.
 */
const SRC = join(__dirname, '../apps/restaurant-system/pos-admin/src/components/qrconsole/QrConsole.tsx');

describe('Overview: a real "needs attention today" panel, not just static tiles', () => {
  const src = readFileSync(SRC, 'utf8');
  const overviewFn = /function Overview\(\{ navigate \}[\s\S]*?(?=\nfunction TablesAndQr)/.exec(src)?.[0] ?? '';

  it('surfaces orders waiting/in the kitchen as an actionable link to QR Orders, not just a tile', () => {
    expect(overviewFn).toMatch(/ordersPending > 0/);
    expect(overviewFn).toMatch(/navigate\("ORDERS"\)/);
  });

  it('surfaces tables without an active QR code as an actionable link to Tables & QR', () => {
    expect(overviewFn).toMatch(/missingCodes = data\.tables - data\.activeCodes/);
    expect(overviewFn).toMatch(/missingCodes > 0/);
    expect(overviewFn).toMatch(/navigate\("TABLES"\)/);
  });

  it('Overview receives navigate from its caller instead of reaching for global state', () => {
    expect(src).toMatch(/function Overview\(\{\s*navigate\s*\}/);
    expect(src).toMatch(/<Overview navigate=\{navigate\}/);
  });
});
