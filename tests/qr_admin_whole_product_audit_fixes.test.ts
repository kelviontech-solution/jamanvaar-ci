import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '../apps/restaurant-system/pos-admin/src/components/qrconsole');

describe('Whole-QR-Admin audit: corrupted glyphs rendering as a literal "?" in the live UI', () => {
  it('Analytics "By table / QR version" row uses real middle-dot separators, not literal "?"', () => {
    const src = readFileSync(join(SRC, 'QrAdvanced.tsx'), 'utf8');
    const row = /Table \{row\.table\}[\s\S]{0,120}money\(row\.sales\)\)?\}/.exec(src)?.[0] ?? '';
    expect(row).not.toMatch(/\?/);
    expect((row.match(/·/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('the cash-refund amount label shows a real rupee sign, not "(?)"', () => {
    const src = readFileSync(join(SRC, 'QrCapabilities.tsx'), 'utf8');
    expect(src).not.toMatch(/Amount refunded \(\?\)/);
    expect(src).toMatch(/Amount refunded \(₹\)/);
  });
});

describe('Whole-QR-Admin audit: License page shows human labels, not raw internal keys', () => {
  const src = readFileSync(join(SRC, 'QrCapabilities.tsx'), 'utf8');

  it('limit keys are humanized the same way every other table in this app humanizes camelCase keys', () => {
    const dlBlock = /<dl className="mt-3 text-xs">[\s\S]{0,600}<\/dl>/.exec(src)?.[0] ?? '';
    expect(dlBlock).toMatch(/replace\(\/\(\[A-Z\]\)\/g/);
  });
});

describe('Whole-QR-Admin audit: Feedback section does not claim to be "loading" when nothing has been requested yet', () => {
  const src = readFileSync(join(SRC, 'QrCapabilities.tsx'), 'utf8');

  it('the pre-filter empty state invites the admin to filter, rather than falsely claiming a load is in progress', () => {
    expect(src).not.toMatch(/<p className="mt-3">Loading feedback\.\.\.<\/p>/);
    expect(src).toMatch(/Choose a date range and click Filter feedback/);
  });
});
