import { describe, it, expect, vi, beforeAll } from 'vitest';

// A tiny in-memory localStorage, in place before the database or the store is first loaded.
vi.hoisted(() => {
  const data = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    get length() { return data.size; }
  } as Storage;
});

/**
 * BUG-106: after a reload Captain forgot who was signed in — restore only accepted a session whose
 * user id equalled the demo profile id "cap-1", and would then have signed in as the demo captain
 * "Rahul Sharma". A reload now keeps the same real staff member signed in.
 */
// Loading the database and store afresh several times is slow when the whole suite runs at once.
describe('Captain session survives a reload (BUG-106)', { timeout: 60_000 }, () => {
  let userId: string;
  let pin: string;

  beforeAll(async () => {
    const { db, StaffRepository } = await import('@jamanvaar/database');
    db.resetToDefaultSeed();
    db.users = [];
    const created = StaffRepository.createUser({ username: 'ravi', fullName: 'Ravi Waiter', roleId: 'role-captain' });
    userId = created.id;
    pin = created.issuedPin;
  }, 60_000);

  it('signing in saves the real user, and a fresh start restores exactly that person', async () => {
    const first = await import('../apps/restaurant-system/captain/src/store/captainStore');
    expect(first.useCaptainStore.getState().login(pin)).toBe(true);

    // The app is closed and reopened: all modules load again, reading from storage.
    vi.resetModules();
    const { db } = await import('@jamanvaar/database');
    db.users = JSON.parse(localStorage.getItem('jamanvaar_db_users') ?? '[]');
    expect(db.users.some((u) => u.id === userId)).toBe(true);
    const reopened = await import('../apps/restaurant-system/captain/src/store/captainStore');
    const state = reopened.useCaptainStore.getState();

    expect(state.isLoggedIn).toBe(true);
    expect(state.authStatus).toBe('AUTHENTICATED');
    expect(state.currentCaptain).toMatchObject({ id: userId, name: 'Ravi Waiter' });
  });

  it('does not restore a session for staff who no longer exist or were deactivated', async () => {
    vi.resetModules();
    const { db } = await import('@jamanvaar/database');
    db.users = JSON.parse(localStorage.getItem('jamanvaar_db_users') ?? '[]').map((u: { id: string }) => (u.id === userId ? { ...u, isActive: false } : u));
    const reopened = await import('../apps/restaurant-system/captain/src/store/captainStore');
    expect(reopened.useCaptainStore.getState().isLoggedIn).toBe(false);
  });

  it('logging out ends the session for good', async () => {
    vi.resetModules();
    const { db } = await import('@jamanvaar/database');
    db.users = JSON.parse(localStorage.getItem('jamanvaar_db_users') ?? '[]').map((u: { id: string }) => ({ ...u, isActive: true }));
    const store = await import('../apps/restaurant-system/captain/src/store/captainStore');
    expect(store.useCaptainStore.getState().isLoggedIn).toBe(true);
    store.useCaptainStore.getState().logout();

    vi.resetModules();
    const again = await import('../apps/restaurant-system/captain/src/store/captainStore');
    expect(again.useCaptainStore.getState().isLoggedIn).toBe(false);
  });
});
