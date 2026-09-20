import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '@jamanvaar/database';
import { usePosStore } from '../apps/restaurant-system/pos/src/store/posStore';

/**
 * BUG-033: POS got slower every day because every db.notify() re-serialised and re-wrote the whole
 * local database (about 45 collections, including every stored order, audit log and print job), and
 * settling one bill notified around ten times. Persistence now writes only collections that changed,
 * and a burst of changes inside db.batch() is written once.
 */
class CountingStorage {
  store = new Map<string, string>();
  writes: string[] = [];
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.writes.push(key);
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
  count(suffix: string) {
    return this.writes.filter((k) => k.endsWith(suffix)).length;
  }
  reset() {
    this.writes = [];
  }
}

describe('Local database persistence (BUG-033)', () => {
  let original: unknown;
  let storage: CountingStorage;

  beforeEach(() => {
    original = (globalThis as unknown as { localStorage: unknown }).localStorage;
    storage = new CountingStorage();
    (globalThis as unknown as { localStorage: unknown }).localStorage = storage;
    db.resetToDefaultSeed();
    if (db.orders.length === 0) {
      db.orders.push({ id: 'seed-o1', orderNumber: 'ORD-1', updatedAt: new Date().toISOString(), items: [] } as never);
    }
    storage.reset();
  });

  afterEach(() => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = original;
  });

  it('a notify with nothing changed rewrites no collection', () => {
    db.notify();
    storage.reset();
    db.notify();
    expect(storage.writes.filter((k) => !k.endsWith('sync_timestamp'))).toEqual([]);
  });

  it('only the collection that changed is rewritten', () => {
    db.notify();
    storage.reset();
    db.orders[0].updatedAt = new Date(Date.now() + 1000).toISOString();
    db.notify();
    expect(storage.count('orders')).toBe(1);
    expect(storage.count('menu_items')).toBe(0);
    expect(storage.count('audit_logs')).toBe(0);
    expect(storage.count('kots')).toBe(0);
  });

  it('changes made inside db.batch() are persisted once, after the last one', () => {
    db.notify();
    storage.reset();
    let heard = 0;
    const off = db.subscribe(() => (heard += 1));
    const result = db.batch(() => {
      for (let i = 0; i < 10; i += 1) {
        db.orders[0].updatedAt = new Date(Date.now() + i).toISOString();
        db.notify();
        expect(storage.count('orders')).toBe(0);
      }
      return 'done';
    });
    off();
    expect(result).toBe('done');
    expect(storage.count('orders')).toBe(1);
    expect(heard).toBe(1);
  });

  it('nested batches persist once, at the outermost end; a batch with no changes persists nothing', () => {
    db.notify();
    storage.reset();
    db.batch(() => {
      db.batch(() => {
        db.orders[0].updatedAt = new Date(Date.now() + 5000).toISOString();
        db.notify();
      });
      expect(storage.count('orders')).toBe(0);
    });
    expect(storage.count('orders')).toBe(1);

    storage.reset();
    db.batch(() => undefined);
    expect(storage.writes).toEqual([]);
  });

  it('still persists, and rethrows, when the batch throws', () => {
    db.notify();
    storage.reset();
    expect(() =>
      db.batch(() => {
        db.orders[0].updatedAt = new Date(Date.now() + 9000).toISOString();
        db.notify();
        throw new Error('boom');
      })
    ).toThrow('boom');
    expect(storage.count('orders')).toBe(1);
  });

  it('settling a bill from the POS writes the orders collection once, not once per step', () => {
    const dish = db.menuItems[0];
    usePosStore.getState().clearCart();
    usePosStore.getState().addItemToCart(dish, [], '', 2);
    db.notify();
    storage.reset();

    const settled = usePosStore.getState().completePayment('CASH', 5000);

    expect(settled?.paymentStatus).toBe('SUCCESS');
    expect(storage.count('orders')).toBe(1);
    expect(storage.count('receipt_records')).toBe(1);
    expect(storage.count('print_jobs')).toBe(1);
  });
});
