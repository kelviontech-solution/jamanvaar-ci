import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '@jamanvaar/database';
import { SyncOutboxEngine } from '@jamanvaar/sync';

/**
 * BUG-HIGH-002: db.syncEvents (the offline outbox queue behind
 * SyncOutboxEngine.queueEvent/processOutbox) was declared but never included
 * in JamanvaarDatabase's saveToStorage()/loadFromStorage() pair — every other
 * collection round-trips through localStorage, this one silently didn't. Any
 * PENDING or FAILED sync event, and its retry count, was lost on reload or
 * process restart, which defeats the point of an offline-first outbox.
 *
 * vitest's default environment here is 'node' (see vitest.config.ts), so
 * there is no real localStorage — a minimal in-memory polyfill stands in for
 * it, which is all db.ts actually needs (getItem/setItem).
 */

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

describe('Sync outbox events survive a restart', () => {
  let originalLocalStorage: unknown;

  beforeEach(() => {
    originalLocalStorage = (globalThis as any).localStorage;
    (globalThis as any).localStorage = new MemoryStorage();
    db.resetToDefaultSeed();
  });

  afterEach(() => {
    (globalThis as any).localStorage = originalLocalStorage;
  });

  it('persists a queued event to storage the moment it is queued', () => {
    const event = SyncOutboxEngine.queueEvent('ORDER_CREATED', { orderId: 'ord-1' }, 'KIOSK-01');

    const raw = (globalThis as any).localStorage.getItem(`${(db as any).storagePrefix}sync_events`);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.some((e: any) => e.id === event.id)).toBe(true);
  });

  it('restores pending events after simulating a restart (in-memory array cleared, storage reloaded)', () => {
    const event = SyncOutboxEngine.queueEvent('ORDER_CREATED', { orderId: 'ord-restart' }, 'KIOSK-01');
    expect(db.syncEvents.some((e) => e.id === event.id)).toBe(true);

    // Simulate the array being empty again, as it would be on a fresh
    // JamanvaarDatabase instance before loadFromStorage() runs.
    db.syncEvents = [];
    expect(db.syncEvents.length).toBe(0);

    (db as any).loadFromStorage();

    const restored = db.syncEvents.find((e) => e.id === event.id);
    expect(restored).toBeDefined();
    expect(restored!.status).toBe('PENDING');
    expect(restored!.payload).toEqual({ orderId: 'ord-restart' });
  });

  it('preserves retry count and FAILED status across the same restart simulation', () => {
    const event = SyncOutboxEngine.queueEvent('ORDER_UPDATED', { orderId: 'ord-retry' }, 'KIOSK-01');
    const live = db.syncEvents.find((e) => e.id === event.id)!;
    live.status = 'FAILED';
    live.retryCount = 3;
    live.errorMessage = 'Simulated transmission failure';
    db.notify();

    db.syncEvents = [];
    (db as any).loadFromStorage();

    const restored = db.syncEvents.find((e) => e.id === event.id);
    expect(restored).toBeDefined();
    expect(restored!.status).toBe('FAILED');
    expect(restored!.retryCount).toBe(3);
    expect(restored!.errorMessage).toBe('Simulated transmission failure');
  });

  it('does not crash when storage holds no sync_events key yet (fresh install)', () => {
    (globalThis as any).localStorage.removeItem(`${(db as any).storagePrefix}sync_events`);
    expect(() => (db as any).loadFromStorage()).not.toThrow();
  });
});
