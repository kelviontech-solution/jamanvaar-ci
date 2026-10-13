import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Restaurant Detail has 15 tabs (Overview, Owner & Users, ... Menu) in a single-row
 * `.tabs` strip that was overflow-x:auto only -- at a normal 1440px viewport, only ~7 fit
 * before the rest (Devices & Keys, Billing & Invoices, Payments, Reports & Analytics, Audit
 * Logs, Support & Diagnostics, Backup & Recovery, Menu) are hidden behind a thin scrollbar
 * a super admin has no obvious reason to notice. Same shared .tabs class is used on the QR
 * Ordering restaurant panel too. Fixed by letting tabs wrap onto more than one row instead
 * of requiring horizontal scroll to discover them.
 */
const SHARED_CSS = join(__dirname, '../cloud/super-admin-web/src/components/shared.css');
const DETAIL_PAGE = join(__dirname, '../cloud/super-admin-web/src/pages/Restaurants/RestaurantDetailPage.tsx');

describe('Super Admin: the shared .tabs strip wraps instead of hiding tabs behind horizontal scroll', () => {
  it('.tabs allows wrapping', () => {
    const css = readFileSync(SHARED_CSS, 'utf8');
    const tabsBlock = /\.tabs\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(tabsBlock).toMatch(/flex-wrap:\s*wrap/);
  });

  it('RestaurantDetailPage no longer forces single-row overflow-x on its tab bar inline', () => {
    const src = readFileSync(DETAIL_PAGE, 'utf8');
    const tabBarLine = /<div className="tabs" style=\{\{([^}]*)\}\}/.exec(src)?.[1] ?? '';
    expect(tabBarLine).not.toMatch(/overflowX/);
  });
});
