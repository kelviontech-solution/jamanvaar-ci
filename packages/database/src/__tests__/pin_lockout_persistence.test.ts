import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * security-audit LOW-pos-admin-01: pinFailureCount/pinLockedUntil used to be plain
 * module-level `let`s, so an app restart reset the brute-force lockout to zero. This
 * proves the lockout now survives a restart by resetting the module registry (a fresh
 * process's module-level state) while keeping the same backing storage (the physical disk).
 */

class MemoryDiskStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  keys(): string[] {
    return Array.from(this.map.keys());
  }
}

describe('StaffRepository PIN lockout persistence', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('keeps the lockout active after a simulated app restart', async () => {
    // PBKDF2 (100k iterations per active user, no early-out) plus two full module reloads
    // can run slower than the 5s default under a loaded CI/full-suite run.
    const disk = new MemoryDiskStorage();

    const { KeyValueStore } = await import('../key_value_store');
    KeyValueStore.attach(disk as unknown as Parameters<typeof KeyValueStore.attach>[0], { migrateLegacy: false });

    const { StaffRepository } = await import('../repositories');

    for (let i = 0; i < 5; i++) {
      await StaffRepository.verifyPin('0000', 'test-restaurant-pin-lockout');
    }
    expect(StaffRepository.pinLockoutRemainingMs()).toBeGreaterThan(0);

    // Simulate an app restart: a fresh module registry (fresh module-level state for
    // every module, including repositories.ts's lockout variables), re-attached to the
    // SAME physical disk the real durable store would have persisted to.
    vi.resetModules();
    const { KeyValueStore: KeyValueStoreAfterRestart } = await import('../key_value_store');
    KeyValueStoreAfterRestart.attach(disk as unknown as Parameters<typeof KeyValueStoreAfterRestart.attach>[0], { migrateLegacy: false });
    const { StaffRepository: StaffRepositoryAfterRestart } = await import('../repositories');

    expect(StaffRepositoryAfterRestart.pinLockoutRemainingMs()).toBeGreaterThan(0);
  }, 20_000);
});
