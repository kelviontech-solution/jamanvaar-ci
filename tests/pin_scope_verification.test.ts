import { describe, it, expect, beforeEach } from 'vitest';
import { db, StaffRepository } from '@jamanvaar/database';

describe('a PIN made under the placeholder restaurant id still verifies after the console is bound to its real restaurant', () => {
  beforeEach(() => db.resetToDefaultSeed());

  it('verifies a manager created before activation, and reports them as a manager', async () => {
    const created = await StaffRepository.createUser({ username: 'early', fullName: 'Early Manager', roleId: 'role-manager' }); // hashed under the placeholder id
    const pin = created.issuedPin!;
    // The console is bound to its real restaurant afterwards, and the POS receives the record without the placeholder id.
    db.restaurant.id = 'real-restaurant-id';
    const synced = { ...StaffRepository.toSyncPayload(created) } as Record<string, unknown>;
    delete synced.pinScope; // an older console did not send it
    db.users = db.users.filter((u) => u.id !== created.id);
    StaffRepository.applyRemoteUser(synced);
    const res = await StaffRepository.verifyPin(pin);
    expect(res?.user.fullName).toBe('Early Manager');
    expect(res?.isManager).toBe(true);
    expect(await StaffRepository.verifyPin('0000')).toBeNull();
  });

  it('a newer console sends the id its PIN was made under, so no guessing is needed', async () => {
    const created = await StaffRepository.createUser({ username: 'scoped', fullName: 'Scoped Manager', roleId: 'role-manager' });
    const payload = StaffRepository.toSyncPayload(created);
    expect(payload.pinScope).toBe(created.restaurantId);
    db.restaurant.id = 'another-real-id';
    db.users = db.users.filter((u) => u.id !== created.id);
    StaffRepository.applyRemoteUser(payload);
    expect((await StaffRepository.verifyPin(created.issuedPin!))?.isManager).toBe(true);
  });
});
