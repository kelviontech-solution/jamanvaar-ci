import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { escapeCsvCell } from '../lib/csvExport';

/**
 * security-audit: PlatformPaymentsDashboardPage's statement export used to build its CSV string
 * inline, only escaping embedded quotes -- never neutralising a leading formula-trigger character
 * (=, +, -, @), unlike every other CSV export in this app, which routes through this same
 * escapeCsvCell. A row field containing a gateway-sourced order id or method string starting with
 * one of those characters would reach the exported file as a live spreadsheet formula.
 */
describe('escapeCsvCell: formula-injection and quote safety', () => {
  it('prefixes every formula-trigger leading character with a neutralising apostrophe', () => {
    expect(escapeCsvCell('=1+1+cmd|\'/c calc\'!A0')).toBe("'=1+1+cmd|'/c calc'!A0");
    expect(escapeCsvCell('+1+1')).toBe("'+1+1");
    expect(escapeCsvCell('-1+1')).toBe("'-1+1");
    expect(escapeCsvCell('@SUM(A1:A9)')).toBe("'@SUM(A1:A9)");
  });

  it('escapes an internal quote and wraps the cell when it contains a comma/quote/newline', () => {
    expect(escapeCsvCell('Say "Hi" to Amit')).toBe('"Say ""Hi"" to Amit"');
    expect(escapeCsvCell('Gandhi Road, Ahmedabad')).toBe('"Gandhi Road, Ahmedabad"');
  });

  it('leaves an ordinary value untouched', () => {
    expect(escapeCsvCell('Priya Sharma')).toBe('Priya Sharma');
    expect(escapeCsvCell(410)).toBe('410');
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });
});

/**
 * The payments-statement export's cell-building has no DOM/jsdom available in this test
 * environment (vitest.config.ts runs environment: 'node'), so this pins the fix at the source
 * level: the function must route every cell through the shared sanitizer, not reimplement its own
 * weaker quote-only escaping.
 */
describe('PlatformPaymentsDashboardPage: statement CSV export uses the shared sanitizer', () => {
  const src = readFileSync(join(__dirname, '../pages/PlatformPayments/PlatformPaymentsDashboardPage.tsx'), 'utf8');

  it('imports escapeCsvCell from the shared sanitizer', () => {
    expect(src).toMatch(/import\s*\{\s*escapeCsvCell\s*\}\s*from\s*['"]\.\.\/\.\.\/lib\/csvExport['"]/);
  });

  it('statementCsv builds its cells with escapeCsvCell, not an inline quote-only escape', () => {
    const start = src.indexOf('function statementCsv');
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf('\n}', start);
    const body = src.slice(start, end);
    expect(body).toMatch(/escapeCsvCell\(c\)/);
    expect(body).not.toMatch(/`"\$\{String\(c\)\.replace/);
  });
});
