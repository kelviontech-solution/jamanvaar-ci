import { describe, it, expect } from 'vitest';
import { areaForRoute, hasAccess } from '../auth/access';
import { areaForPath, ROLE_ACCESS } from '../../../api/src/common/rbac/access';

// The web app's route→area table mirrors the API's; a drift means a menu item that shows up but
// 403s, or one that is hidden although the server would allow it.
const ROUTES: Array<[string, string]> = [
  ['/restaurants', '/api/v1/restaurants'], ['/owners', '/api/v1/owners'], ['/branches', '/api/v1/branches'],
  ['/subscriptions', '/api/v1/subscriptions'], ['/plans', '/api/v1/plans'], ['/billing', '/api/v1/invoices'],
  ['/payment-connections', '/api/v1/payment-connections'], ['/platform-payments', '/api/v1/payments/platform-summary'],
  ['/payouts', '/api/v1/payments/payouts'], ['/activation-keys', '/api/v1/activation-keys'],
  ['/devices', '/api/v1/devices'], ['/applications', '/api/v1/applications'], ['/support', '/api/v1/support'],
  ['/tickets', '/api/v1/support-tickets'], ['/qr-ordering', '/api/v1/qr-ordering'], ['/ai-assistant', '/api/v1/ai-assistant'],
  ['/catalog', '/api/v1/master-catalog'], ['/audit-logs', '/api/v1/audit-logs'], ['/team', '/api/v1/platform-users'],
  ['/feature-catalog', '/api/v1/features'], ['/entitlements', '/api/v1/application-entitlements/catalog']
];

describe('web/API route-area parity', () => {
  for (const [route, apiPath] of ROUTES) {
    it(`${route} maps to the same area as ${apiPath}`, () => {
      expect(areaForRoute(route)).toBe(areaForPath(apiPath));
    });
  }
});

describe('role permissions drive page access', () => {
  it('a READ_ONLY user can open the Feature Catalog but not edit it', () => {
    const area = areaForRoute('/feature-catalog');
    expect(hasAccess(ROLE_ACCESS.READ_ONLY, area, 'read')).toBe(true);
    expect(hasAccess(ROLE_ACCESS.READ_ONLY, area, 'write')).toBe(false);
  });

  it('an unknown route is denied for everyone', () => {
    expect(hasAccess(ROLE_ACCESS.SUPER_ADMIN, areaForRoute('/nope'), 'read')).toBe(false);
  });
});
