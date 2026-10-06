import { describe, it, expect, beforeEach } from 'vitest';
import { db, StaffRepository } from '@jamanvaar/database';

/**
 * Two cashiers in one restaurant: the cashier selected on the POS screen must be the one who signs in. A PIN
 * that belongs to the other cashier must be refused, not used to sign in as that other person.
 */
describe('POS sign-in opens only the selected staff member', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    db.users = [];
  });

  it('the selected cashier signs in with their own PIN', async () => {
    const first = await StaffRepository.createUser({ fullName: 'Cashier One', username: 'cashone', roleId: 'role-cashier' });
    const second = await StaffRepository.createUser({ fullName: 'Cashier Two', username: 'cashtwo', roleId: 'role-cashier' });
    const result = await StaffRepository.verifyPin(second.issuedPin!, undefined, { userId: second.id });
    expect(result?.user.id).toBe(second.id);
    expect(first.id).not.toBe(second.id);
  });

  it("another cashier's PIN is refused when a different cashier is selected", async () => {
    const first = await StaffRepository.createUser({ fullName: 'Cashier One', username: 'cashone', roleId: 'role-cashier' });
    const second = await StaffRepository.createUser({ fullName: 'Cashier Two', username: 'cashtwo', roleId: 'role-cashier' });
    const result = await StaffRepository.verifyPin(first.issuedPin!, undefined, { userId: second.id, countFailure: false });
    expect(result).toBeNull();
  });
});
