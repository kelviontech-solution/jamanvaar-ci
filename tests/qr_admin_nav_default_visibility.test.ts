import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "Advanced Features" holds real, paid, actively-toggled capabilities (Loyalty, Promotions,
 * Multilingual menu, Private feedback) but was hidden behind "Show advanced tools" alongside
 * genuinely occasional setup tools (QR Design Studio, Pickup Scheduling, QR Settings). An owner
 * who pays for Loyalty had to discover a hidden toggle before finding their own paid feature.
 * Analytics (checking how the business is doing) is daily-use too. Both now show by default.
 */
const SRC = join(__dirname, '../apps/restaurant-system/pos-admin/src/components/qrconsole/QrConsole.tsx');

describe('QR Admin nav: features owners actively use day-to-day are not hidden behind "Show advanced tools"', () => {
  const src = readFileSync(SRC, 'utf8');
  const basicPagesLine = /const basicPages = new Set<Tab>\(\[([^\]]*)\]\)/.exec(src)?.[1] ?? '';

  it('Advanced Features (Loyalty, Promotions, Multilingual, Feedback) is visible by default', () => {
    expect(basicPagesLine).toMatch(/'ADVANCED'/);
  });

  it('Analytics is visible by default', () => {
    expect(basicPagesLine).toMatch(/'ANALYTICS'/);
  });

  it('genuinely occasional setup tools stay collapsed by default', () => {
    expect(basicPagesLine).not.toMatch(/'DESIGN'/);
    expect(basicPagesLine).not.toMatch(/'PICKUP'/);
    expect(basicPagesLine).not.toMatch(/'SETTINGS'/);
    expect(basicPagesLine).not.toMatch(/'PERFORMANCE'/);
  });
});
