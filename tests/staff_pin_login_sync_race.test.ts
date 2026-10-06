import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db, KeyValueStore, StaffRepository, hashPin } from '@jamanvaar/database';
import { EntitySyncEngine, verifyPinWithSync } from '@jamanvaar/sync';

/**
 * Live production bug (reproduced against a real running stack, not just reasoned about):
 * Restaurant Admin creates a staff member and pushes the new STAFF_USER record to the cloud
 * immediately, but every other terminal (POS/Captain/KDS) only *pulls* it on its own ~15s
 * interval. A cashier handed a brand-new PIN seconds after creation tries it on POS before
 * that device's next pull ever runs, sees "Invalid 4-digit PIN", and — reasonably — believes
 * the PIN is broken. `StaffRepository.verifyPin` itself was never wrong (its data, once
 * pulled, verifies correctly); the bug was that nothing ever told POS to go get that data
 * *now* instead of waiting for the next tick. `verifyPinWithSync` closes that window: it
 * tries the already-local data first (free — matches the common case, no PIN is "new" most
 * of the time), and only pulls once, then re-checks, on a miss.
 */
describe('verifyPinWithSync (closes the "freshly-issued PIN not yet synced" window)', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() { return store.size; }
    });
    store.clear();
    KeyValueStore.reset();
    db.resetToDefaultSeed();
    db.users = [];
  });

  afterEach(() => {
    EntitySyncEngine.configureTransport(null);
    vi.restoreAllMocks();
  });

  it('finds a PIN that only exists on the cloud so far, by pulling once before reporting it invalid', async () => {
    const pin = '7412';
    const pinHash = await hashPin(pin, db.restaurant.id);
    const remoteUser = {
      id: 'usr-remote-fresh', username: 'freshhire', fullName: 'Fresh Hire', email: '', phone: '',
      roleId: 'role-cashier', isActive: true, pinHash, pinScope: db.restaurant.id,
      createdAt: '2026-10-06T12:00:00.000Z', updatedAt: '2026-10-06T12:00:00.000Z'
    };
    const pull = vi.fn(async () => ({
      entities: [{ externalId: remoteUser.id, payload: remoteUser, updatedAt: remoteUser.updatedAt }],
      latestSeq: 1, hasMore: false, serverTime: new Date().toISOString()
    }));
    EntitySyncEngine.configureTransport({ push: vi.fn(async () => ({ results: [], serverTime: new Date().toISOString() })), pull });

    expect(db.users).toHaveLength(0); // this device has not pulled anything yet

    const result = await verifyPinWithSync(pin);

    expect(result?.user.id).toBe('usr-remote-fresh');
    expect(pull).toHaveBeenCalledOnce(); // exactly one pull — not polled in a loop
    expect(db.users.find((u) => u.id === 'usr-remote-fresh')).toBeDefined(); // applied locally too
  });

  it('does not re-sync when the PIN already matches local data (the common case stays free)', async () => {
    const staff = await StaffRepository.createUser({ fullName: 'Already Synced', username: 'alreadysynced', roleId: 'role-cashier' });
    const pull = vi.fn(async () => ({ entities: [], latestSeq: 0, hasMore: false, serverTime: new Date().toISOString() }));
    EntitySyncEngine.configureTransport({ push: vi.fn(async () => ({ results: [], serverTime: new Date().toISOString() })), pull });

    const result = await verifyPinWithSync(staff.issuedPin!);

    expect(result?.user.id).toBe(staff.id);
    expect(pull).not.toHaveBeenCalled();
  });

  it('a genuinely wrong PIN still costs exactly one lockout strike, even though this checks twice', async () => {
    const staff = await StaffRepository.createUser({ fullName: 'Lockout Guard', username: 'lockoutguard', roleId: 'role-cashier' });
    const wrongPin = staff.issuedPin === '0000' ? '0001' : '0000';
    const pull = vi.fn(async () => ({ entities: [], latestSeq: 0, hasMore: false, serverTime: new Date().toISOString() }));
    EntitySyncEngine.configureTransport({ push: vi.fn(async () => ({ results: [], serverTime: new Date().toISOString() })), pull });

    // The documented threshold is 5 consecutive wrong PINs (MED-07). If the silent pre-sync
    // probe also counted, 3 calls would already exceed it (3 x 2 = 6 > 5).
    for (let i = 0; i < 4; i++) {
      expect(await verifyPinWithSync(wrongPin)).toBeNull();
    }
    expect(StaffRepository.pinLockoutRemainingMs()).toBe(0); // not locked yet after 4 real wrong attempts

    expect(await verifyPinWithSync(wrongPin)).toBeNull(); // the 5th trips it
    expect(StaffRepository.pinLockoutRemainingMs()).toBeGreaterThan(0);

    // Clean up module-level lockout state for later tests in this file/run, the same way
    // the existing lockout suite does: end on a successful check once the cooldown passes.
    vi.useFakeTimers();
    vi.advanceTimersByTime(30_001);
    expect((await StaffRepository.verifyPin(staff.issuedPin!))?.user.id).toBe(staff.id);
    vi.useRealTimers();
  });
});
