import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, StaffRepository } from '@jamanvaar/database';
import { SessionPersistence } from '@jamanvaar/business';
import { usePosStore } from '../apps/restaurant-system/pos/src/store/posStore';

// A tiny in-memory localStorage — this test suite runs under Node, which has
// none — in place before SessionPersistence (which silently no-ops without
// it, by design for private-mode/storage-full browsers) is first used.
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
 * security-audit LOW-05 regression suite. lockTerminal() used to set
 * isLocked only in the in-memory Zustand store — a webview reload (Ctrl+R,
 * the crash-recovery "Restore Workspace" button) re-initialized the store
 * from the still-valid persisted session with no lock recorded anywhere, so
 * the terminal came back unlocked as whoever was last signed in. lockTerminal
 * and unlockTerminal now also persist `locked` on the session record, and
 * restoreSession — the same path a fresh app start takes — reads it back.
 */
describe('POS terminal lock survives a reload (LOW-05)', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    usePosStore.getState().logout();
  });

  it('lockTerminal persists locked:true on the session record, not just in-memory state', () => {
    const staff = StaffRepository.createUser({ fullName: 'Lock Test Cashier', username: 'locktestcashier', roleId: 'role-cashier' });
    usePosStore.getState().loginWithPin(staff.issuedPin!);
    expect(usePosStore.getState().isLocked).toBe(false);

    usePosStore.getState().lockTerminal();
    expect(usePosStore.getState().isLocked).toBe(true);
    expect(SessionPersistence.load('pos')?.locked).toBe(true);
  });

  it('a simulated reload (restoreSession re-reading the persisted session from scratch) comes back locked, not silently unlocked', () => {
    const staff = StaffRepository.createUser({ fullName: 'Reload Test Cashier', username: 'reloadtestcashier', roleId: 'role-cashier' });
    usePosStore.getState().loginWithPin(staff.issuedPin!);
    usePosStore.getState().lockTerminal();
    expect(usePosStore.getState().isLocked).toBe(true);

    // Simulate what the old, buggy hardcoded `isLocked: false` init did:
    // start the in-memory state unlocked, as if this were a brand new store
    // instance that hadn't yet consulted the persisted lock flag.
    usePosStore.setState({ isLocked: false });
    expect(usePosStore.getState().isLocked).toBe(false);

    // restoreSession is the same re-initialization path a fresh app start
    // takes (see its own doc comment) — it must restore the lock, not drop it.
    usePosStore.getState().restoreSession();
    expect(usePosStore.getState().isLocked).toBe(true);
    expect(usePosStore.getState().currentUser?.id).toBe(staff.id);
  });

  it('unlockTerminal with the correct PIN clears the persisted lock flag too', () => {
    const staff = StaffRepository.createUser({ fullName: 'Unlock Test Cashier', username: 'unlocktestcashier', roleId: 'role-cashier' });
    usePosStore.getState().loginWithPin(staff.issuedPin!);
    usePosStore.getState().lockTerminal();
    expect(SessionPersistence.load('pos')?.locked).toBe(true);

    const ok = usePosStore.getState().unlockTerminal(staff.issuedPin!);
    expect(ok).toBe(true);
    expect(usePosStore.getState().isLocked).toBe(false);
    expect(SessionPersistence.load('pos')?.locked).toBe(false);

    // And a reload after a real unlock must not resurrect the lock.
    usePosStore.setState({ isLocked: true });
    usePosStore.getState().restoreSession();
    expect(usePosStore.getState().isLocked).toBe(false);
  });

  it('a fresh login always starts unlocked, even if a stale locked flag somehow lingered', () => {
    const staff = StaffRepository.createUser({ fullName: 'Fresh Login Cashier', username: 'freshlogincashier', roleId: 'role-cashier' });
    usePosStore.getState().loginWithPin(staff.issuedPin!);
    expect(usePosStore.getState().isLocked).toBe(false);
    expect(SessionPersistence.load('pos')?.locked ?? false).toBe(false);
  });
});
