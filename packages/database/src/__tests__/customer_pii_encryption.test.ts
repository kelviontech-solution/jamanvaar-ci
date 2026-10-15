import { describe, it, expect, vi } from 'vitest';
import { JamanvaarDatabase } from '../db';

/**
 * security-audit LOW-pos-admin-02: customer PII (phone, name, email, address, DOB, notes) used
 * to be written to the local SQLite/localStorage store as plain JSON, readable by anyone with
 * direct filesystem access to the device. These tests prove the on-disk bytes are now
 * ciphertext, that a real app restart can still decrypt them (the device key itself survives,
 * same mechanism as pin_lockout_persistence.test.ts), and that a pre-fix plaintext database is
 * read correctly rather than being treated as corrupt (the lazy migration path).
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

const SENSITIVE_MARKERS = ['Priya Sharma', '9876543210', 'priya@example.com', 'Lives above the bakery'];

function makeCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cust-1',
    restaurantId: 'rest-1',
    phone: '9876543210',
    name: 'Priya Sharma',
    email: 'priya@example.com',
    notes: 'Lives above the bakery',
    tags: [],
    favoriteItemIds: [],
    recentOrderIds: [],
    loyaltyPoints: 0,
    totalVisits: 0,
    totalSpend: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

describe('Customer PII encryption at rest', () => {
  it('writes customer PII as ciphertext, not plaintext, to the durable store', () => {
    const disk = new MemoryDiskStorage();
    const db = JamanvaarDatabase.getInstanceForRole('POS_ADMIN', 'test_pii_ciphertext_');
    db.attachDurableStorage(disk as unknown as Parameters<typeof db.attachDurableStorage>[0]);

    db.customerAccounts.push(makeCustomer() as never);
    db.notify();

    const rawOnDisk = disk.getItem('test_pii_ciphertext_customer_accounts');
    expect(rawOnDisk).toBeTruthy();
    for (const marker of SENSITIVE_MARKERS) {
      expect(rawOnDisk).not.toContain(marker);
    }
    expect(rawOnDisk).toContain('encv1:');
  });

  it('reads a pre-fix plaintext database instead of treating it as corrupt (migration path)', () => {
    const disk = new MemoryDiskStorage();
    const legacyCustomer = makeCustomer({ id: 'cust-legacy', name: 'Legacy Customer', phone: '9123456780' });
    // Exactly what saveToStorage wrote before this fix: a plain JSON array, no ciphertext.
    disk.setItem('test_pii_migration_customer_accounts', JSON.stringify([legacyCustomer]));

    const db = JamanvaarDatabase.getInstanceForRole('POS_ADMIN', 'test_pii_migration_');
    db.attachDurableStorage(disk as unknown as Parameters<typeof db.attachDurableStorage>[0]);

    expect(db.customerAccounts).toHaveLength(1);
    expect(db.customerAccounts[0].name).toBe('Legacy Customer');

    // The very next save migrates it to ciphertext automatically.
    db.notify();
    const rawAfterSave = disk.getItem('test_pii_migration_customer_accounts');
    expect(rawAfterSave).toContain('encv1:');
    expect(rawAfterSave).not.toContain('Legacy Customer');
  });

  it('decrypts customer PII correctly after a simulated app restart', async () => {
    const disk = new MemoryDiskStorage();
    const db = JamanvaarDatabase.getInstanceForRole('POS_ADMIN', 'test_pii_restart_');
    db.attachDurableStorage(disk as unknown as Parameters<typeof db.attachDurableStorage>[0]);
    db.customerAccounts.push(makeCustomer() as never);
    db.notify();

    // Simulate an app restart: a fresh module registry (fresh in-memory `db` instance, with no
    // cached device key), but the SAME physical disk the durable store would really have
    // persisted to -- including the device encryption key, which must also survive for the
    // data to be readable again.
    vi.resetModules();
    const { JamanvaarDatabase: JamanvaarDatabaseAfterRestart } = await import('../db');
    const dbAfterRestart = JamanvaarDatabaseAfterRestart.getInstanceForRole('POS_ADMIN', 'test_pii_restart_');
    dbAfterRestart.attachDurableStorage(disk as unknown as Parameters<typeof dbAfterRestart.attachDurableStorage>[0]);

    expect(dbAfterRestart.customerAccounts).toHaveLength(1);
    expect(dbAfterRestart.customerAccounts[0].name).toBe('Priya Sharma');
    expect(dbAfterRestart.customerAccounts[0].phone).toBe('9876543210');
    expect((dbAfterRestart.customerAccounts[0] as { notes?: string }).notes).toBe('Lives above the bakery');
  }, 20_000);
});
