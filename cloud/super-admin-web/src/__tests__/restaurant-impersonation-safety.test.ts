import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * security-audit: RestaurantDetailPage's "Impersonate Owner" button called a backend route that
 * doesn't exist (`/support/impersonate/${id}`, path-segment id; the real route is
 * `/support/impersonate` with restaurantId in the body) -- so the mint always 404'd. The design
 * also had no confirmation/reason prompt, no permission gate, and would have opened the minted
 * owner-level bearer token embedded in a `window.open` URL query string. Fixed to match the real
 * API contract and to show the token the same safe way Support > Impersonate already does (a
 * readonly copyable field, never a URL). No DOM/jsdom is available in this test environment
 * (vitest.config.ts runs environment: 'node'), so the fix is pinned at the source level, matching
 * the convention used elsewhere in this package (access-parity.test.ts).
 */
describe('RestaurantDetailPage: Impersonate Owner matches the real API and never puts the token in a URL', () => {
  const src = readFileSync(join(__dirname, '../pages/Restaurants/RestaurantDetailPage.tsx'), 'utf8');

  it('posts to the real backend route with restaurantId in the body, not a path segment', () => {
    const start = src.indexOf('async function handleImpersonateOwner');
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, start + 900);
    expect(block).toMatch(/api\.post[^(]*\(\s*['"]\/api\/v1\/support\/impersonate['"]/);
    expect(block).toMatch(/restaurantId:\s*restaurant\.id/);
    expect(block).not.toMatch(/\/api\/v1\/support\/impersonate\/\$\{restaurant\.id\}/);
  });

  it('reads the response using the real flat shape (ownerEmail), not a nested owner.email', () => {
    const start = src.indexOf('async function handleImpersonateOwner');
    const block = src.slice(start, start + 900);
    expect(block).toMatch(/ownerEmail:\s*string/);
    expect(block).not.toMatch(/owner:\s*\{\s*email:\s*string\s*\}/);
  });

  it('requires a non-empty operator-entered reason before minting', () => {
    const start = src.indexOf('async function handleImpersonateOwner');
    const block = src.slice(start, start + 900);
    expect(block).toMatch(/if \(!restaurant \|\| !impersonateReason\.trim\(\)\) return;/);
    expect(block).not.toMatch(/Super Admin troubleshooting and audit inspection/);
  });

  it('never embeds the access token in a window.open URL', () => {
    expect(src).not.toMatch(/window\.open\([^)]*impersonationToken/);
    expect(src).not.toMatch(/window\.open\([^)]*accessToken/);
  });

  it('the trigger button is gated by the same permission check as every sibling write action, and fires only through a reason-prompting modal', () => {
    const start = src.indexOf('<span>Impersonate Owner</span>');
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(Math.max(0, start - 400), start);
    expect(block).toMatch(/disabled=\{!canWriteRestaurants\}/);
    expect(block).toMatch(/onClick=\{\(\) => \{ setImpersonateReason\(''\); setImpersonateModalOpen\(true\); \}\}/);
  });
});
