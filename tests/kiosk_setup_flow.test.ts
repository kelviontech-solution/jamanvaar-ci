import { describe, it, expect } from 'vitest';
import { kioskSetupLink } from '../apps/restaurant-system/pos-admin/src/components/kiosk/kioskSetup';
import { kioskActivationError } from '../apps/kiosk-system/kiosk-user/src/activationErrors';
describe('kiosk setup handoff', () => {
  it('passes public identity and branch only, stripping credentials-like query and fragments', () => {
    const url = new URL(kioskSetupLink('https://example.com/kiosk/?activationKey=private#private', 'JM9876543210', 'branch-a')!);
    expect(url.pathname).toBe('/kiosk/');
    expect(Object.fromEntries(url.searchParams)).toEqual({ restaurantCode: 'JM9876543210', branchId: 'branch-a' });
    expect(url.hash).toBe('');
  });
  it('rejects executable, credential-bearing and insecure nonlocal links', () => {
    for (const url of ['javascript:alert(1)', 'https://user:password@example.com/kiosk/', 'http://example.com/kiosk/'])
      expect(kioskSetupLink(url, 'JM9876543210', 'a')).toBeNull();
  });
  it('supports local dev and does not invent a link when identity or deployment address is absent', () => {
    expect(kioskSetupLink('http://localhost:5174/kiosk/', 'JM9876543210', 'a')).toContain('localhost:5174');
    expect(kioskSetupLink(null, 'JM9876543210', 'a')).toBeNull();
    expect(kioskSetupLink('https://example.com/kiosk/', null, 'a')).toBeNull();
  });
  it.each(['restaurant', 'branch'])('explains wrong %s keys without exposing raw server data', (scope) => {
    const message = kioskActivationError(
      Object.assign(new Error('This activation key belongs to another ' + scope + '. internal detail'), { status: 400 }),
      'key'
    );
    expect(message).toContain('key has not been used');
    expect(message).not.toContain('internal detail');
  });
  it('explains a key issued for another app', () => {
    expect(kioskActivationError(Object.assign(new Error('This activation code is only valid for POS devices, not KIOSK'), { status: 400 }), 'key')).toContain(
      'Customer Kiosk'
    );
  });
});
