import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '../packages/database/src/db';
import { KOTRepository, OrderRepository } from '../packages/database/src/repositories';
import { SqlKvEngine } from '../packages/database/src/durable/sql_kv_engine';
import { NodeSqliteDriver } from '../packages/database/src/durable/node_driver';
import { DurableStorage, EngineBackend, migrateFromLocalStorage } from '../packages/database/src/durable/durable_storage';

let dir: string;
const file = () => join(dir, 'app.sqlite3');
const openStorage = (opts?: { retryMs?: number }) => DurableStorage.open(new EngineBackend(new SqlKvEngine(new NodeSqliteDriver(file()))), opts);

const makeOrder = (id: string) =>
  OrderRepository.createOrder({
    id, items: [{ id: `oi-${id}`, menuItemId: 'm', name: 'Tea', quantity: 1, unitPrice: 100, totalPrice: 100, modifiers: [], kitchenStatus: 'PENDING', kitchenStation: 'Main Kitchen' }] as never,
    subtotal: 100, totalAmount: 105, orderType: 'TAKEAWAY', idempotencyKey: `idem-${id}`
  } as never);

describe('the database on SQLite', () => {
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'jv-db-')); });
  afterEach(() => {
    (db as any).store = null;
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* file may still be closing */ }
  });

  it('an order and its KOT written in one operation survive a restart together', async () => {
    const first = await openStorage();
    db.attachDurableStorage(first);
    const o = makeOrder('sqlite-1');
    KOTRepository.generateKOT({ orderId: o.id, orderNumber: o.orderNumber, tokenNumber: o.tokenNumber, orderType: 'TAKEAWAY', items: o.items as never, cashierName: 'c' } as never);
    await first.flush();
    first.close();

    // Restart: brand-new storage on the same file, brand-new in-memory state.
    db.orders = [];
    db.kots = [];
    const second = await openStorage();
    db.attachDurableStorage(second);
    expect(db.orders.some((x) => x.id === 'sqlite-1')).toBe(true);
    expect(db.kots.some((k) => k.orderId === 'sqlite-1')).toBe(true);
    second.close();
  });

  it('a save that fails to reach the disk is reported, kept, and lands once the disk recovers', async () => {
    const backend = new EngineBackend(new SqlKvEngine(new NodeSqliteDriver(file())));
    const storage = await DurableStorage.open(backend, { retryMs: 5 });
    db.attachDurableStorage(storage);
    backend.failNext = 2;
    makeOrder('sqlite-fail');
    await storage.flush().catch(() => undefined);
    expect(db.getPersistenceHealth().ok).toBe(false);

    await new Promise((r) => setTimeout(r, 80));
    await storage.flush();
    expect(db.getPersistenceHealth().ok).toBe(true);
    storage.close();

    db.orders = [];
    const restarted = await openStorage();
    db.attachDurableStorage(restarted);
    expect(db.orders.some((x) => x.id === 'sqlite-fail')).toBe(true);
    restarted.close();
  });

  it('only the changed order is rewritten, however many orders exist', async () => {
    const backend = new EngineBackend(new SqlKvEngine(new NodeSqliteDriver(file())));
    const engine = (backend as any).engine as SqlKvEngine;
    const storage = await DurableStorage.open(backend);
    db.attachDurableStorage(storage);
    for (let i = 0; i < 60; i++) makeOrder(`bulk-${i}`);
    await storage.flush();
    makeOrder('bulk-extra');
    await storage.flush();
    expect(engine.lastRowWrites).toBeLessThan(10); // the new order (+ its side effects), not all 60+
    storage.close();
  });

  it('existing localStorage data is imported once on first use', async () => {
    const store = new Map<string, string>();
    const prefix = (db as any).storagePrefix as string;
    store.set(`${prefix}orders`, JSON.stringify([{ id: 'legacy-order', items: [], orderStatus: 'NEW', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]));
    const ls = { getItem: (k: string) => store.get(k) ?? null, key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; } };
    const storage = await openStorage();
    const result = await migrateFromLocalStorage(storage, ls, prefix);
    expect(result.migrated).toBe(1);
    db.attachDurableStorage(storage);
    expect(db.orders.some((o) => o.id === 'legacy-order')).toBe(true);
    storage.close();
  });
});
