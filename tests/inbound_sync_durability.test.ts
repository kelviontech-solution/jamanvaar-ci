import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db, KeyValueStore, InventoryRepository } from '@jamanvaar/database';
import { SyncOutboxEngine, type CloudSyncedOrder } from '../packages/sync/src/outbox';
import { EndpointResolver } from '../packages/sync/src/endpoint_resolver';
import { DurableStorage, EngineBackend } from '../packages/database/src/durable/durable_storage';
import { SqlKvEngine } from '../packages/database/src/durable/sql_kv_engine';
import { NodeSqliteDriver } from '../packages/database/src/durable/node_driver';

let dir: string, storage: DurableStorage, sql: SqlKvEngine, backend: EngineBackend;
const cursorKey = () => EndpointResolver.cursorKey('jamanvaar_order_sync_cursor', '/api/v1/orders/sync');
const remote = (): CloudSyncedOrder => ({ externalOrderId: 'incoming-bill', orderType: 'TAKEAWAY', status: 'CONFIRMED',
  items: [{ externalItemId: 'incoming-line', menuItemId: 'incoming-dish', name: 'Meal', quantity: 1, unitPrice: 10000, lineTotal: 10000, modifiers: [] }],
  subtotal: 10000, discountAmount: 0, taxAmount: 0, totalAmount: 10000, paymentStatus: 'PENDING', paymentMethod: 'CASH_AT_COUNTER',
  meta: { sourceType: 'POS' }, seq: 9, updatedAt: '2026-10-19T01:00:00.000Z' });
function connect(order = remote()) {
  const pull = vi.fn(async (_cursor?: string) => ({ orders: [order], latestSeq: 9, serverTime: order.updatedAt }));
  SyncOutboxEngine.configureTransport({ pull, push: async () => ({ results: [], serverTime: order.updatedAt }) });
  return pull;
}
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'jv-inbound-sync-'));
  sql = new SqlKvEngine(new NodeSqliteDriver(join(dir, 'device.sqlite3')));
  backend = new EngineBackend(sql); storage = await DurableStorage.open(backend, { retryMs: 60000 });
  KeyValueStore.attach(storage, { migrateLegacy: false }); db.attachDurableStorage(storage);
  db.orders = []; db.kots = []; db.syncEvents = []; db.stockMovements = [];
  db.notify(); await storage.flush();
});
afterEach(() => {
  SyncOutboxEngine.configureTransport(null); vi.restoreAllMocks(); KeyValueStore.reset(); storage?.close();
  rmSync(dir, { recursive: true, force: true });
});
describe('inbound order persistence before cursor acknowledgement', () => {
  it('acknowledges an empty page without rebroadcasting unchanged orders', async () => {
    SyncOutboxEngine.configureTransport({ push: async () => ({ results: [], serverTime: '' }),
      pull: async () => ({ orders: [], latestSeq: 9, serverTime: remote().updatedAt }) });
    const notify = vi.spyOn(db, 'notify');
    expect(await SyncOutboxEngine.catchUpFromCloud()).toEqual({ pulled: 0, created: 0 });
    expect(KeyValueStore.get(cursorKey())).toBe('seq:9'); expect(notify).not.toHaveBeenCalled();
  });
  it('does not advance a cursor while the orders and kitchen tickets are waiting for SQLite', async () => {
    connect(); let enter!: () => void, release!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const write = backend.write.bind(backend);
    vi.spyOn(backend, 'write').mockImplementation(async ops => {
      if (ops.some(op => op.key.endsWith('_orders'))) { enter(); await gate; }
      return write(ops);
    });
    const task = SyncOutboxEngine.catchUpFromCloud();
    try {
      await entered;
      expect(KeyValueStore.get(cursorKey())).not.toBe('seq:9');
      release(); await task; await storage.flush();
      expect(KeyValueStore.get(cursorKey())).toBe('seq:9');
      const values = sql.loadAll();
      expect(JSON.parse(values[storage.keys().find(key => key.endsWith('_orders'))!] ?? '[]')).toHaveLength(1);
      expect(JSON.parse(values[storage.keys().find(key => key.endsWith('_kots'))!] ?? '[]')).toHaveLength(1);
    } finally { release(); await task; }
  });
  it('retains the old cursor on disk failure and retries without duplicating the order or KOT', async () => {
    const pull = connect(); const write = backend.write.bind(backend); let fail = true;
    vi.spyOn(backend, 'write').mockImplementation(async ops => { if (fail) throw Error('Disk unavailable'); return write(ops); });
    await SyncOutboxEngine.catchUpFromCloud();
    expect(KeyValueStore.get(cursorKey())).not.toBe('seq:9');
    fail = false; await storage.flush(); await SyncOutboxEngine.catchUpFromCloud(); await storage.flush();
    expect(pull.mock.calls[1]?.[0]).toBe('seq:0');
    expect(db.orders).toHaveLength(1); expect(db.kots).toHaveLength(1);
    expect(sql.loadAll()[cursorKey()]).toBe('seq:9');
  });
  it.each(['SAVED_LOCALLY', 'SYNCING', 'FAILED', 'DEAD_LETTER'] as const)('does not overwrite %s local edits with an unsequenced legacy response', async status => {
    connect(); await SyncOutboxEngine.catchUpFromCloud(); await storage.flush();
    const order = db.orders[0]; order.customerNotes = 'Local allergy instruction'; order.syncStatus = status;
    order.items[0].quantity = 2; order.items[0].totalPrice = 200; order.totalAmount = 200;
    order.updatedAt = '2026-10-19T02:00:00.000Z'; db.notify(); await storage.flush();
    const stale = { ...remote(), seq: undefined, notes: 'Older cloud instruction', updatedAt: '2099-01-01T00:00:00.000Z' };
    connect(stale);
    // Configuring a new transport deliberately normalizes abandoned SYNCING
    // rows at startup. Model a live push after that startup step.
    order.syncStatus = status;
    await SyncOutboxEngine.catchUpFromCloud();
    expect(db.orders[0].customerNotes).toBe('Local allergy instruction');
    expect(db.orders[0].items[0].quantity).toBe(2); expect(db.orders[0].totalAmount).toBe(200);
    expect(db.orders[0].syncStatus).toBe(status);
  });
  it('rolls back page admission and retains the cursor if inventory preparation fails', async () => {
    connect(); vi.spyOn(InventoryRepository, 'reconcileOrder').mockImplementation(() => { throw Error('Inventory validation failed'); });
    await SyncOutboxEngine.catchUpFromCloud(); await storage.flush();
    expect(db.orders).toHaveLength(0); expect(db.kots).toHaveLength(0);
    expect(KeyValueStore.get(cursorKey())).not.toBe('seq:9');
  });
  it('defers admission while an earlier financial operation needs recovery', async () => {
    const saved = await db.commitFinancialMutation('e'.repeat(64), () => ({ orderId: 'pending-existing-operation' }));
    const pull = connect(); await SyncOutboxEngine.catchUpFromCloud();
    expect(pull).not.toHaveBeenCalled(); expect(db.orders).toHaveLength(0);
    await db.acknowledgeFinancialMutation(saved.operationId);
    await SyncOutboxEngine.catchUpFromCloud(); expect(db.orders).toHaveLength(1);
  });
  it('rechecks pending operations after an in-flight pull returns', async () => {
    let release!: () => void, enter!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    SyncOutboxEngine.configureTransport({ push: async () => ({ results: [], serverTime: '' }), pull: async () => {
      enter(); await gate; return { orders: [remote()], latestSeq: 9, serverTime: remote().updatedAt };
    } });
    const task = SyncOutboxEngine.catchUpFromCloud();
    await entered;
    try {
      const saved = await db.commitFinancialMutation('f'.repeat(64), () => ({ orderId: 'operation-started-during-pull' }));
      release(); await task;
      expect(db.orders).toHaveLength(0); expect(KeyValueStore.get(cursorKey())).not.toBe('seq:9');
      await db.acknowledgeFinancialMutation(saved.operationId);
    } finally { release(); await task; }
  });
  it('keeps an acknowledged first page when preparation of the next page fails', async () => {
    let page = 0;
    SyncOutboxEngine.configureTransport({ push: async () => ({ results: [], serverTime: '' }), pull: async () => {
      page++; const first = page === 1;
      return { orders: [{ ...remote(), externalOrderId: first ? 'first-bill' : 'second-bill', seq: first ? 9 : 10 }],
        latestSeq: first ? 9 : 10, hasMore: first, serverTime: remote().updatedAt };
    } });
    const reconcile = InventoryRepository.reconcileOrder.bind(InventoryRepository);
    vi.spyOn(InventoryRepository, 'reconcileOrder').mockImplementation(order => {
      if (order.id === 'second-bill') throw Error('Invalid second-page inventory');
      return reconcile(order);
    });
    expect(await SyncOutboxEngine.catchUpFromCloud()).toEqual({ pulled: 1, created: 1 });
    await storage.flush();
    expect(db.orders.map(order => order.id)).toEqual(['first-bill']);
    expect(db.kots).toHaveLength(1); expect(sql.loadAll()[cursorKey()]).toBe('seq:9');
  });
});
