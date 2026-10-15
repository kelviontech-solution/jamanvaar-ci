import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * security-audit: the impersonation-token panel used to stay visible based on a restaurant NAME
 * match (impersonationResult.restaurantName === diagnostics.restaurant.name), and nothing cleared
 * it when the operator switched to a different restaurant. Nothing in the schema/DTO stops two
 * restaurants sharing a name, so a stale token minted for restaurant A could render under a
 * same-named restaurant B's panel. This file's own render environment has no DOM (vitest runs with
 * environment: 'node'), so the fix is pinned at the source level -- see
 * cloud/super-admin-web/src/__tests__/access-parity.test.ts for the same convention elsewhere in
 * this package.
 */
describe('SupportPage: impersonation token is identified and cleared by restaurant ID, not name', () => {
  const src = readFileSync(join(__dirname, '../pages/Support/SupportPage.tsx'), 'utf8');

  it('impersonationResult state carries restaurantId', () => {
    const start = src.indexOf('const [impersonationResult, setImpersonationResult] = useState');
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, start + 400);
    expect(block).toMatch(/restaurantId:\s*string/);
  });

  it('the token mint stores the restaurantId it was minted for', () => {
    const start = src.indexOf("actionModal.type === 'IMPERSONATE'");
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, start + 600);
    expect(block).toMatch(/setImpersonationResult\(\{\s*\.\.\.res,\s*restaurantId:\s*actionModal\.targetId\s*\}\)/);
  });

  it('the panel visibility check compares restaurant IDs, not names', () => {
    expect(src).toMatch(/impersonationResult\.restaurantId === diagnostics\.restaurant\.id/);
    expect(src).not.toMatch(/impersonationResult\.restaurantName === diagnostics\.restaurant\.name/);
  });

  it('loadDiagnostics clears a stale token only when switching to a genuinely different restaurant', () => {
    const start = src.indexOf('async function loadDiagnostics');
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, start + 600);
    expect(block).toMatch(/setImpersonationResult\(\(prev\) => \(prev && prev\.restaurantId !== restaurantId \? null : prev\)\)/);
  });
});
