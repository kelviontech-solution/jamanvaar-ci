import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Restaurant Admin usability review: clicking Orders/Billing/most nav items before picking a
 * branch showed a dead-end "Choose a branch to continue" card with no picker on that screen --
 * the only way out was scrolling back up to a separate Workspace selector in the header. Fixed by
 * rendering the same AdminBranchWorkspace picker directly inside the blocker card.
 */
const SRC = join(__dirname, '../apps/restaurant-system/pos-admin/src/App.tsx');

describe('Restaurant Admin: branch-choice blocker has an inline picker, not just a dead-end message', () => {
  const src = readFileSync(SRC, 'utf8');
  const block = src.slice(src.indexOf("'Choose a branch to continue'") - 200, src.indexOf("'Choose a branch to continue'") + 700);

  it('renders AdminBranchWorkspace inside the blocker card once branch scope is ready', () => {
    expect(block).toMatch(/branchScopeReady\s*&&\s*<div[^>]*><AdminBranchWorkspace/);
  });

  it('the blocker copy tells the user to pick a branch right there, not just "use the selector above"', () => {
    expect(block).toMatch(/pick one below/i);
  });
});
