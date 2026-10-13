import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Super Admin feature request: margin/cost view. Reports showed revenue but nothing about what it
 * costs to serve a restaurant. JAMANVAAR does not track real per-restaurant infra cost anywhere, so
 * getMargins() is explicitly built from a single admin-editable assumption (PlatformSetting-backed),
 * never presented as audited billing data -- both the API doc comment and the page's own copy say so.
 */
const SERVICE = join(__dirname, '../cloud/api/src/modules/reports/reports.service.ts');
const PAGE = join(__dirname, '../cloud/super-admin-web/src/pages/Margins/MarginsPage.tsx');
const ACCESS = join(__dirname, '../cloud/super-admin-web/src/auth/access.ts');

describe('Margin & Cost view', () => {
  it('getMargins only counts live subscriptions (TRIAL/ACTIVE/PAST_DUE), not every subscription ever created', () => {
    const src = readFileSync(SERVICE, 'utf8');
    const block = src.slice(src.indexOf('async getMargins('), src.indexOf('async getMargins(') + 900);
    expect(block).toMatch(/status:\s*\{\s*in:\s*\['TRIAL',\s*'ACTIVE',\s*'PAST_DUE'\]\s*\}/);
  });

  it('falls back to a sensible default cost assumption when none has been saved yet', () => {
    const src = readFileSync(SERVICE, 'utf8');
    expect(src).toMatch(/DEFAULT_ASSUMED_COST_PAISE/);
  });

  it('estimatedMargin is MRR minus assumed cost, not just MRR', () => {
    const src = readFileSync(SERVICE, 'utf8');
    const block = src.slice(src.indexOf('async getMargins('), src.indexOf('async getMargins(') + 1800);
    expect(block).toMatch(/p\.mrrPaise - assumedCostTotalPaise/);
  });

  it('the page labels the numbers as an estimate, not audited billing data', () => {
    const src = readFileSync(PAGE, 'utf8');
    expect(src.toLowerCase()).toMatch(/estimate/);
  });

  it('the frontend route->area table registers /margins under reports', () => {
    const src = readFileSync(ACCESS, 'utf8');
    expect(src).toMatch(/\{\s*prefix:\s*'\/margins'\s*,\s*area:\s*'reports'\s*\}/);
  });
});
