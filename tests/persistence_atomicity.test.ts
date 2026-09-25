import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../packages/database/src/db';
import { KOTRepository, OrderRepository } from '../packages/database/src/repositories';

/**
 * The local store persists many collections. A crash or power loss between two of those writes used
 * to leave, for example, an order on disk with no KOT and no sync-queue state. Saves are now
 * journaled: the changed collections are written to one journal entry first, so recovery either
 * replays a complete save or finds nothing to replay.
 */
class MemoryStorage {
  store = new Map<string, string>();
  /** When set, throws on the Nth setItem call from now (simulating a crash / quota failure). */
  failAfter: number | null = null;
  failWith: Error | null = null;
  writes = 0;
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) {
    if (this.failAfter !== null) {
      if (this.failAfter <= 0) throw this.failWith ?? new Error('crash');
      this.failAfter--;
    }
    this.writes++;
    this.store.set(k, v);
  }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}

const prefix = () => (db as any).storagePrefix as string;

function makeOrder(id: string) {
  return OrderRepository.createOrder({
    id, items: [{ id: `oi-${id}`, menuItemId: 'm', name: 'Tea', quantity: 1, unitPrice: 100, totalPrice: 100, modifiers: [], kitchenStatus: 'PENDING', kitchenStation: 'Main Kitchen' }] as never,
    subtotal: 100, totalAmount: 105, orderType: 'TAKEAWAY', idempotencyKey: `idem-${id}`
  } as never);
}

describe('local store persistence', () => {
  let storage: MemoryStorage;
  let original: unknown;

  beforeEach(() => {
    original = (globalThis as any).localStorage;
    storage = new MemoryStorage();
    (globalThis as any).localStorage = storage;
    db.resetToDefaultSeed();
    storage.writes = 0;
  });
  afterEach(() => {
    (globalThis as any).localStorage = original;
  });

  it('leaves no journal behind after a normal save', () => {
    makeOrder('atomic-ok');
    expect(storage.getItem(`${prefix()}__journal`)).toBeNull();
    expect(JSON.parse(storage.getItem(`${prefix()}orders`)!).some((o: any) => o.id === 'atomic-ok')).toBe(true);
  });

  it('a crash part-way through a save is recovered on restart: the order and its KOT are both there', () => {
    const order = makeOrder('atomic-crash-base');
    // Crash after the journal and the first data key are written, before the rest.
    storage.failAfter = 2;
    db.batch(() => {
      const o = makeOrder('atomic-crash');
      KOTRepository.generateKOT({ orderId: o.id, orderNumber: o.orderNumber, tokenNumber: o.tokenNumber, orderType: 'TAKEAWAY', items: o.items as never, cashierName: 'c' } as never);
    });
    storage.failAfter = null;

    // "Restart": in-memory state gone, storage reloaded (loadFromStorage replays the journal first).
    db.orders = [];
    db.kots = [];
    (db as any).loadFromStorage();

    expect(db.orders.some((o) => o.id === 'atomic-crash')).toBe(true);
    expect(db.kots.some((k) => k.orderId === 'atomic-crash')).toBe(true);
    expect(db.orders.some((o) => o.id === order.id)).toBe(true);
    expect(storage.getItem(`${prefix()}__journal`)).toBeNull();
  });

  it('a failing storage (quota full) is reported, not swallowed, and recovers when space returns', () => {
    storage.failAfter = 0;
    storage.failWith = Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
    makeOrder('atomic-quota');
    const health = db.getPersistenceHealth();
    expect(health.ok).toBe(false);
    expect(health.error).toMatch(/quota/i);

    storage.failAfter = null;
    db.notify();
    expect(db.getPersistenceHealth().ok).toBe(true);
    expect(JSON.parse(storage.getItem(`${prefix()}orders`)!).some((o: any) => o.id === 'atomic-quota')).toBe(true);
  });

  it('a transaction rolls every touched collection back when it throws, and commits once when it succeeds', () => {
    const before = db.orders.length;
    expect(() =>
      db.transaction(() => {
        makeOrder('atomic-rollback');
        throw new Error('boom');
      })
    ).toThrow('boom');
    expect(db.orders.length).toBe(before);
    expect(db.orders.some((o) => o.id === 'atomic-rollback')).toBe(false);

    storage.writes = 0;
    db.transaction(() => {
      makeOrder('atomic-commit-1');
      makeOrder('atomic-commit-2');
    });
    expect(db.orders.some((o) => o.id === 'atomic-commit-2')).toBe(true);
    const ordersWrites = [...storage.store.keys()].filter((k) => k.endsWith('orders')).length;
    expect(ordersWrites).toBe(1);
  });
});
