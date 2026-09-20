import { describe, it, expect } from 'vitest';
import { areaForPath, canAccess, permissionsForRole } from './access';

/**
 * BUG-082/083/084: every platform endpoint used to be reachable by every team
 * member. Access is now decided by a role -> area table, deny-by-default.
 */
describe('area for request path', () => {
  it.each([
    ['/api/v1/invoices', 'billing'],
    ['/api/v1/invoices/abc/payments', 'billing'],
    ['/api/v1/restaurants', 'restaurants'],
    ['/api/v1/restaurants/abc', 'restaurants'],
    ['/api/v1/restaurants/abc/backups', 'ops'],
    ['/api/v1/restaurants/abc/license-certificate', 'licensing'],
    ['/api/v1/activation-keys', 'devices'],
    ['/api/v1/devices/xyz/lock', 'devices'],
    ['/api/v1/subscriptions/abc/renew', 'subscriptions'],
    ['/api/v1/plans', 'subscriptions'],
    ['/api/v1/platform/settings/platform.maintenance', 'settings'],
    ['/api/v1/platform/offline-policy/grant', 'licensing'],
    ['/api/v1/support-tickets', 'support'],
    ['/api/v1/platform-users/invite', 'team'],
    ['/api/v1/platform/me', 'self'],
    ['/api/v1/platform/sessions/abc', 'self'],
    ['/api/v1/audit-logs', 'audit'],
    ['/api/v1/master-catalog/items', 'catalog'],
    ['/api/v1/platform/backups', 'ops']
  ])('%s -> %s', (path, area) => {
    expect(areaForPath(path)).toBe(area);
  });

  it('returns null for an unknown path so the guard can deny it', () => {
    expect(areaForPath('/api/v1/something-new')).toBeNull();
  });
});

describe('canAccess (role, area, method)', () => {
  it('finance admin can read and write billing but cannot touch devices or create restaurants', () => {
    expect(canAccess('FINANCE_ADMIN', 'billing', 'GET')).toBe(true);
    expect(canAccess('FINANCE_ADMIN', 'billing', 'POST')).toBe(true);
    expect(canAccess('FINANCE_ADMIN', 'restaurants', 'GET')).toBe(true);
    expect(canAccess('FINANCE_ADMIN', 'restaurants', 'POST')).toBe(false);
    expect(canAccess('FINANCE_ADMIN', 'devices', 'GET')).toBe(false);
    expect(canAccess('FINANCE_ADMIN', 'settings', 'GET')).toBe(false);
  });

  it('read-only can read most areas but never write, and never see licensing or settings', () => {
    expect(canAccess('READ_ONLY', 'restaurants', 'GET')).toBe(true);
    expect(canAccess('READ_ONLY', 'billing', 'GET')).toBe(true);
    expect(canAccess('READ_ONLY', 'billing', 'POST')).toBe(false);
    expect(canAccess('READ_ONLY', 'devices', 'PATCH')).toBe(false);
    expect(canAccess('READ_ONLY', 'licensing', 'GET')).toBe(false);
    expect(canAccess('READ_ONLY', 'settings', 'GET')).toBe(false);
  });

  it('support admin can write tickets but not billing; ops can write devices but not billing', () => {
    expect(canAccess('SUPPORT_ADMIN', 'support', 'POST')).toBe(true);
    expect(canAccess('SUPPORT_ADMIN', 'billing', 'GET')).toBe(false);
    expect(canAccess('PLATFORM_OPS', 'devices', 'PATCH')).toBe(true);
    expect(canAccess('PLATFORM_OPS', 'billing', 'GET')).toBe(false);
  });

  it('super admin writes everywhere except platform settings (read only); the owner writes everywhere', () => {
    expect(canAccess('SUPER_ADMIN', 'restaurants', 'POST')).toBe(true);
    expect(canAccess('SUPER_ADMIN', 'settings', 'GET')).toBe(true);
    expect(canAccess('SUPER_ADMIN', 'settings', 'PATCH')).toBe(false);
    expect(canAccess('PLATFORM_OWNER', 'settings', 'PATCH')).toBe(true);
  });

  it('every role may use its own account area', () => {
    (['PLATFORM_OWNER', 'SUPER_ADMIN', 'PLATFORM_OPS', 'SUPPORT_ADMIN', 'FINANCE_ADMIN', 'READ_ONLY'] as const).forEach((r) => {
      expect(canAccess(r, 'self', 'PATCH')).toBe(true);
    });
  });

  it('denies an unknown area and an unknown role', () => {
    expect(canAccess('FINANCE_ADMIN', null, 'GET')).toBe(false);
    expect(canAccess('SUPER_ADMIN', null, 'GET')).toBe(true); // owner-level roles may use unmapped areas
    expect(canAccess('NOT_A_ROLE' as any, 'billing', 'GET')).toBe(false);
  });

  it('exposes the permission table for the interface', () => {
    const p = permissionsForRole('FINANCE_ADMIN');
    expect(p.billing).toBe('write');
    expect(p.restaurants).toBe('read');
    expect(p.devices).toBeUndefined();
  });
});
