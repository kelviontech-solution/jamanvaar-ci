import { describe, it, expect } from 'vitest';
import { StaffRepository } from '@jamanvaar/database';

/**
 * BUG-118: any staff PIN opened any terminal — a waiter's PIN unlocked the kitchen screen and the
 * POS (which even listed the waiter as a sign-in profile). Each terminal accepts the roles that
 * work on it; owners and managers work everywhere; a custom role the restaurant made up is never
 * locked out.
 */
describe('Which staff roles may use which terminal (BUG-118)', () => {
  const can = (role: string, terminal: 'POS' | 'KDS' | 'CAPTAIN' | 'KIOSK') => StaffRepository.canUseTerminal(role, terminal);

  it('owners and managers work everywhere', () => {
    for (const role of ['role-super-admin', 'role-manager']) {
      for (const t of ['POS', 'KDS', 'CAPTAIN', 'KIOSK'] as const) expect(can(role, t)).toBe(true);
    }
  });

  it('a cashier bills at the POS and nowhere else on the floor', () => {
    expect(can('role-cashier', 'POS')).toBe(true);
    expect(can('role-cashier', 'KDS')).toBe(false);
    expect(can('role-cashier', 'CAPTAIN')).toBe(false);
  });

  it('a waiter uses Captain only', () => {
    expect(can('role-captain', 'CAPTAIN')).toBe(true);
    expect(can('role-captain', 'POS')).toBe(false);
    expect(can('role-captain', 'KDS')).toBe(false);
  });

  it('a chef uses the kitchen screen only', () => {
    expect(can('role-chef', 'KDS')).toBe(true);
    expect(can('role-chef', 'POS')).toBe(false);
    expect(can('role-chef', 'CAPTAIN')).toBe(false);
  });

  it('a custom or missing role is not locked out', () => {
    expect(can('role-runner', 'POS')).toBe(true);
    expect(can(undefined as never, 'KDS')).toBe(true);
  });

  it('gives a plain-words reason', () => {
    expect(StaffRepository.terminalDeniedMessage('role-captain', 'KDS')).toMatch(/Captain \/ Waiter/);
    expect(StaffRepository.terminalDeniedMessage('role-captain', 'KDS')).toMatch(/kitchen/i);
  });
});
