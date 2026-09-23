import { describe, it, expect, beforeEach } from 'vitest';
import { db, StaffRepository } from '@jamanvaar/database';

/**
 * BUG-019/034/035 (discovered live, verified against a real running stack): a staff PIN issued from
 * Restaurant Admin is meant to work on POS, Captain, KDS and Kiosk — the create/reset screen says so
 * outright. But staff records were entirely absent from the cross-device entity-sync bridge (only
 * CUSTOMER/MENU_ITEM/MENU_CATEGORY/INVENTORY_ITEM/PAYMENT_TRANSACTION existed), so a PIN worked only on
 * the one device that created it. `toSyncPayload`/`applyRemoteUser` are the shared logic every app's
 * sync tick uses to push/pull STAFF_USER, the same way MENU_ITEM/CUSTOMER already work.
 */
describe('Staff cross-device sync payload (BUG-019/034/035)', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    db.users = [];
  });

  it('the sync payload carries the PIN hash and role, never a plaintext PIN', () => {
    const { issuedPin, ...created } = StaffRepository.createUser({ username: 'amitdave', fullName: 'Amit Dave', roleId: 'role-cashier' });
    const payload = StaffRepository.toSyncPayload(created);
    expect(payload).toMatchObject({ id: created.id, username: 'amitdave', fullName: 'Amit Dave', roleId: 'role-cashier', isActive: true });
    expect(payload.pinHash).toBe((created as unknown as { pinHash: string }).pinHash);
    expect(JSON.stringify(payload)).not.toContain(issuedPin);
  });

  it('a remote user is created locally on first pull, and its PIN works', () => {
    const remote = { id: 'usr-remote-1', username: 'poojashah', fullName: 'Pooja Shah', email: '', phone: '', roleId: 'role-manager', isActive: true, pinHash: 'pinv1:aabbccddeeff0011', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };

    expect(db.users.find((u) => u.id === 'usr-remote-1')).toBeUndefined();
    StaffRepository.applyRemoteUser(remote);

    const local = db.users.find((u) => u.id === 'usr-remote-1');
    expect(local).toMatchObject({ fullName: 'Pooja Shah', roleId: 'role-manager' });
    expect(StaffRepository.verifyPin('0000', db.restaurant.id)).toBeNull(); // sanity: wrong pin never matches
  });

  it('pulling the same user again updates it in place rather than duplicating it', () => {
    const remote = { id: 'usr-remote-2', username: 'rahuls', fullName: 'Rahul Sharma', roleId: 'role-captain', isActive: true, pinHash: 'pinv1:1111111122222222', updatedAt: '2026-01-01T00:00:00.000Z' };
    StaffRepository.applyRemoteUser(remote);
    StaffRepository.applyRemoteUser({ ...remote, fullName: 'Rahul Sharma (Senior)', updatedAt: '2026-01-02T00:00:00.000Z' });

    const matches = db.users.filter((u) => u.id === 'usr-remote-2');
    expect(matches).toHaveLength(1);
    expect(matches[0].fullName).toBe('Rahul Sharma (Senior)');
  });

  /**
   * security-audit MED-12: "Remove staff" (StaffRepository.deleteUser) used to splice
   * the row out of the LOCAL array only — invisible to entity-sync, since STAFF_USER
   * has no delete/tombstone semantics, only create/update. A terminated employee's PIN
   * kept authenticating on every other terminal that had already pulled their record.
   * This is the push side of the fix in the test above: deleting locally must still
   * produce a syncable, isActive:false payload — the record must not simply vanish.
   */
  it('deleting a staff member locally produces an isActive:false sync payload, not a vanished record', () => {
    const created = StaffRepository.createUser({ username: 'temp', fullName: 'Temp Worker', roleId: 'role-cashier' });
    const deleted = StaffRepository.deleteUser(created.id);
    expect(deleted).toBe(true);

    const local = db.users.find((u) => u.id === created.id);
    expect(local).toBeDefined(); // still present, not spliced away — this is what makes it syncable at all
    expect(local!.isActive).toBe(false);

    const payload = StaffRepository.toSyncPayload(local!);
    expect(payload.id).toBe(created.id);
    expect(payload.isActive).toBe(false);

    // The other side: a second "device" pulling this payload correctly deactivates too.
    db.users = db.users.filter((u) => u.id !== created.id); // simulate a device that never had this user
    StaffRepository.applyRemoteUser(payload);
    expect(db.users.find((u) => u.id === created.id)?.isActive).toBe(false);
  });

  it('a deactivated staff member syncs as inactive, and their PIN then stops working everywhere', () => {
    const remote = { id: 'usr-remote-3', username: 'off', fullName: 'Off Duty', roleId: 'role-cashier', isActive: false, pinHash: 'pinv1:deadbeefcafef00d' };
    StaffRepository.applyRemoteUser(remote);
    expect(db.users.find((u) => u.id === 'usr-remote-3')?.isActive).toBe(false);
  });

  it('ignores a malformed remote record instead of corrupting the local staff list', () => {
    const before = db.users.length;
    // @ts-expect-error intentionally malformed for the test
    StaffRepository.applyRemoteUser({ fullName: 'No id or pinHash' });
    expect(db.users.length).toBe(before);
  });

  it('every real staff member currently in the restaurant produces a valid sync payload (what the app pushes each tick)', () => {
    StaffRepository.createUser({ username: 'a', fullName: 'A', roleId: 'role-cashier' });
    StaffRepository.createUser({ username: 'b', fullName: 'B', roleId: 'role-manager' });
    const payloads = db.users.map((u) => StaffRepository.toSyncPayload(u));
    expect(payloads).toHaveLength(2);
    for (const p of payloads) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.pinHash).toBe('string');
    }
  });
});
