import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * New Super Admin routes have bitten this exact way twice before (see the BUG comments already in
 * auth/access.ts for /whatsapp-ordering and /platform-payments/-payouts): the route gets added to
 * App.tsx and the sidebar in ProtectedLayout.tsx, but areaForRoute()'s ROUTE_AREAS table is a
 * separate, manually-kept list -- miss it and the page fails CLOSED ("You don't have access to this
 * page") for every role, including Platform Owner, even though the backend would allow it. Confirmed
 * live: navigating to /restaurant-health as Platform Owner showed exactly that "does not include
 * this area" screen. Fixed by registering the route's area alongside the others.
 */
const SRC = join(__dirname, '../cloud/super-admin-web/src/auth/access.ts');

describe('Restaurant Health route is registered in the frontend route->area table', () => {
  it('ROUTE_AREAS includes /restaurant-health', () => {
    const src = readFileSync(SRC, 'utf8');
    expect(src).toMatch(/\{\s*prefix:\s*'\/restaurant-health'\s*,\s*area:\s*'reports'\s*\}/);
  });
});
