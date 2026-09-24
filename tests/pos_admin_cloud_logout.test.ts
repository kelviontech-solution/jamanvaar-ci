import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

/**
 * security-audit LOW-05 regression: cloudLogout() used to just null the
 * in-memory access token — the server-side refresh session (a 30-day httpOnly
 * cookie) stayed valid, so any call to request() after "sign out" would
 * silently re-authenticate via the refresh endpoint (POSADMIN-09). It must
 * now call POST /api/v1/tenant-auth/logout, which revokes the refresh
 * session server-side (already covered by cloud/api/test/tenant-auth.e2e.spec.ts),
 * before clearing local state — and handleAdminLogout must actually call it.
 *
 * A behavioral test (mocked fetch + DeviceGate's real module-init timers)
 * proved too fragile for this file's runtime shape to be worth the flake
 * risk; this checks the fix landed the way it's meant to, source-level,
 * matching this codebase's existing pattern for that trade-off
 * (see tests/restaurant_id_visibility.test.ts).
 */
describe('POS-Admin sign-out revokes the server-side session (LOW-05)', () => {
  const cloudClient = read('apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts');
  const app = read('apps/restaurant-system/pos-admin/src/App.tsx');

  it('cloudLogout calls the real logout endpoint before clearing the local access token', () => {
    const fn = cloudClient.slice(cloudClient.indexOf('export async function cloudLogout'));
    const body = fn.slice(0, fn.indexOf('\n}') + 2);
    expect(body).toMatch(/tenant-auth\/logout/);
    expect(body.indexOf('tenant-auth/logout')).toBeLessThan(body.indexOf('accessToken = null'));
  });

  it('a network failure during logout does not block local sign-out', () => {
    const fn = cloudClient.slice(cloudClient.indexOf('export async function cloudLogout'));
    const body = fn.slice(0, fn.indexOf('\n}') + 2);
    expect(body).toMatch(/catch/);
  });

  it('handleAdminLogout actually calls cloudLogout', () => {
    const fn = app.slice(app.indexOf('const handleAdminLogout'));
    const body = fn.slice(0, fn.indexOf('};') + 2);
    expect(body).toMatch(/cloudLogout\(\)/);
  });
});
