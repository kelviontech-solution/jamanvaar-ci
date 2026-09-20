import { describe, it, expect, beforeEach } from 'vitest';
import { db, StaffRepository, ManagerOverrideRepository } from '../packages/database/src';

/**
 * BUG-005/006/009/011/012: no seeded demo staff, no demo login, and Restaurant Admin can
 * now issue a working PIN when it creates or resets a staff member — the "assign PIN to
 * staff from Restaurant Admin" the owner asked for directly. Every login surface (POS,
 * Captain, KDS, Kiosk, manager override) verifies through the one StaffRepository.verifyPin.
 */
describe('Staff login and PIN issuance', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
  });

  it('a fresh restaurant has no seeded staff and no seeded open shift', () => {
    expect(db.users).toHaveLength(0);
    expect(db.shifts).toHaveLength(0);
  });

  it('creating a staff member issues a working PIN, shown once on the returned record', () => {
    const staff = StaffRepository.createUser({ fullName: 'Vikram Sarabhai', username: 'vikrams', roleId: 'role-cashier' });
    expect(staff.issuedPin).toMatch(/^\d{4}$/);
    // The plaintext PIN is never stored — only its hash.
    expect(db.users.find((u) => u.id === staff.id)).not.toHaveProperty('issuedPin');

    const result = StaffRepository.verifyPin(staff.issuedPin!);
    expect(result?.user.id).toBe(staff.id);
  });

  it('never fabricates an email when none is given', () => {
    const staff = StaffRepository.createUser({ fullName: 'No Email Person', username: 'noemail', roleId: 'role-cashier' });
    expect(staff.email).toBe('');
  });

  it('two staff created back to back never collide on the same PIN', () => {
    const a = StaffRepository.createUser({ fullName: 'A', username: 'a1', roleId: 'role-cashier' });
    const b = StaffRepository.createUser({ fullName: 'B', username: 'b1', roleId: 'role-cashier' });
    expect(a.issuedPin).not.toBe(b.issuedPin);
  });

  it('resetting a PIN issues a new one and the old PIN no longer works', () => {
    const staff = StaffRepository.createUser({ fullName: 'Reset Me', username: 'resetme', roleId: 'role-cashier' });
    const oldPin = staff.issuedPin!;
    const reset = StaffRepository.resetPin(staff.id);
    expect(reset?.issuedPin).toBeTruthy();
    expect(reset?.issuedPin).not.toBe(oldPin);
    expect(StaffRepository.verifyPin(oldPin)).toBeNull();
    expect(StaffRepository.verifyPin(reset!.issuedPin!)?.user.id).toBe(staff.id);
  });

  it('rejects an unknown PIN, and a correct PIN for an inactive staff member', () => {
    const staff = StaffRepository.createUser({ fullName: 'Inactive Guy', username: 'inact', roleId: 'role-cashier', isActive: false });
    expect(StaffRepository.verifyPin('0007')).toBeNull();
    expect(StaffRepository.verifyPin(staff.issuedPin!)).toBeNull();
  });

  it('flags who can approve a manager override, by real role, via the same verification path', () => {
    const cashier = StaffRepository.createUser({ fullName: 'Cashier', username: 'c1', roleId: 'role-cashier' });
    const manager = StaffRepository.createUser({ fullName: 'Manager', username: 'm1', roleId: 'role-manager' });

    const cashierAttempt = ManagerOverrideRepository.verifyPin(cashier.issuedPin!);
    expect(cashierAttempt.success).toBe(true);
    expect(cashierAttempt.isManager).toBe(false);

    const managerAttempt = ManagerOverrideRepository.verifyPin(manager.issuedPin!);
    expect(managerAttempt.success).toBe(true);
    expect(managerAttempt.isManager).toBe(true);
  });

  it('exposes readable role names for the roles a restaurant actually has', () => {
    expect(StaffRepository.getRoleName('role-cashier')).toMatch(/cashier/i);
    expect(StaffRepository.getRoleName('role-captain')).toMatch(/captain/i);
    expect(StaffRepository.getRoleName('does-not-exist')).toBe('Staff');
  });
});
