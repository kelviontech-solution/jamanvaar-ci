import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db, KeyValueStore } from '@jamanvaar/database';
import { EntitySyncEngine, type CloudSyncedEntity } from '../packages/sync/src/entity_sync';
import { EndpointResolver } from '../packages/sync/src/endpoint_resolver';
import { DurableStorage, EngineBackend } from '../packages/database/src/durable/durable_storage';
import { SqlKvEngine } from '../packages/database/src/durable/sql_kv_engine';
import { NodeSqliteDriver } from '../packages/database/src/durable/node_driver';

let dir: string, storage: DurableStorage, backend: EngineBackend;
const families = [
  { type: 'MENU_CATEGORY', field: 'categories', key: 'categories' },
  { type: 'CUSTOMER', field: 'customerAccounts', key: 'customer_accounts' },
  { type: 'INVENTORY_ITEM', field: 'inventoryItems', key: 'inventory_items' }
] as const;
const entity = (id = 'incoming-record'): CloudSyncedEntity => ({ externalId: id, payload: { id, name: 'Incoming record', phone: '9876500001', loyaltyPoints: 20 },
  updatedAt: '2026-10-19T01:00:00.000Z', syncVersion: 1 });
const cursorKey = (type: string) => EndpointResolver.cursorKey(`jamanvaar_entity_sync_cursor_${type}`, `/api/v1/entity-sync/${type}`);
function connect(entities = [entity()]) {
  const pull = vi.fn(async (_type: string, _cursor?: string) => ({ entities, serverTime: entity().updatedAt, latestSeq: 9 }));
  EntitySyncEngine.configureTransport({ pull, push: async () => ({ results: [], serverTime: '' }) });
  return pull;
}
function consumer(field: typeof families[number]['field']) {
  return (incoming: CloudSyncedEntity) => {
    const records = db[field] as Array<{ id: string }>;
    const index = records.findIndex(record => record.id === incoming.externalId);
    const record = { ...incoming.payload, id: incoming.externalId };
    if (index < 0) records.push(record); else records[index] = record;
    db.notify();
  };
}
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'jv-entity-admission-'));
  backend = new EngineBackend(new SqlKvEngine(new NodeSqliteDriver(join(dir, 'entities.sqlite3'))));
  storage = await DurableStorage.open(backend, { retryMs: 60000 });
  KeyValueStore.attach(storage, { migrateLegacy: false }); db.attachDurableStorage(storage);
  db.categories = []; db.customerAccounts = []; db.inventoryItems = []; db.orders = []; db.kots = [];
  db.notify(); await storage.flush();
});
afterEach(() => {
  EntitySyncEngine.configureTransport(null); vi.restoreAllMocks(); KeyValueStore.reset(); storage?.close();
  rmSync(dir, { recursive: true, force: true });
});
describe('entity data persistence before cursor acknowledgement', () => {
  it.each(families)('waits for $type data before acknowledging its sequence', async family => {
    connect(); let enter!: () => void, release!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const write = backend.write.bind(backend);
    vi.spyOn(backend, 'write').mockImplementation(async ops => {
      if (ops.some(op => op.key.endsWith(`_${family.key}`))) { enter(); await gate; }
      return write(ops);
    });
    const task = EntitySyncEngine.catchUp(family.type, consumer(family.field));
    try {
      await entered; expect(KeyValueStore.get(cursorKey(family.type))).not.toBe('seq:9');
      release(); expect(await task).toEqual({ pulled: 1 }); await storage.flush();
      expect(KeyValueStore.get(cursorKey(family.type))).toBe('seq:9');
      db.attachDurableStorage(storage); expect(db[family.field]).toHaveLength(1);
      expect(db[family.field][0]).toMatchObject(family.type === 'CUSTOMER' ? { phone: '9876500001', loyaltyPoints: 20 } : { id: 'incoming-record' });
    } finally { release(); await task; }
  });
  it('keeps its old cursor after disk failure and retries a partially materialized page without duplication', async () => {
    const pull = connect(); const write = backend.write.bind(backend); let fail = true;
    vi.spyOn(backend, 'write').mockImplementation(async ops => { if (fail) throw Error('Disk unavailable'); return write(ops); });
    expect(await EntitySyncEngine.catchUp('MENU_CATEGORY', consumer('categories'))).toEqual({ pulled: 0 });
    expect(KeyValueStore.get(cursorKey('MENU_CATEGORY'))).not.toBe('seq:9');
    fail = false; await storage.flush(); await EntitySyncEngine.catchUp('MENU_CATEGORY', consumer('categories')); await storage.flush();
    expect(pull.mock.calls[1]?.[1]).toBe('seq:0'); expect(db.categories).toHaveLength(1);
    expect(KeyValueStore.get(cursorKey('MENU_CATEGORY'))).toBe('seq:9');
  });
  it('does not acknowledge a failed consumer page and retries its earlier records by their stable identifiers', async () => {
    connect([entity('first'), entity('second')]); let fail = true;
    const apply = consumer('categories');
    const consume = (incoming: CloudSyncedEntity) => { if (fail && incoming.externalId === 'second') throw Error('Invalid category'); apply(incoming); };
    await EntitySyncEngine.catchUp('MENU_CATEGORY', consume);
    expect(KeyValueStore.get(cursorKey('MENU_CATEGORY'))).not.toBe('seq:9');
    fail = false; await EntitySyncEngine.catchUp('MENU_CATEGORY', consume); await storage.flush();
    expect(db.categories.map(category => category.id)).toEqual(['first', 'second']);
    expect(KeyValueStore.get(cursorKey('MENU_CATEGORY'))).toBe('seq:9');
  });
  it('defers incoming customer balances while a financial operation needs recovery', async () => {
    const saved = await db.commitFinancialMutation('a'.repeat(64), () => ({ orderId: 'existing-operation' }));
    const pull = connect(); await EntitySyncEngine.catchUp('CUSTOMER', consumer('customerAccounts'));
    expect(pull).not.toHaveBeenCalled(); expect(db.customerAccounts).toHaveLength(0);
    await db.acknowledgeFinancialMutation(saved.operationId);
    await EntitySyncEngine.catchUp('CUSTOMER', consumer('customerAccounts')); expect(db.customerAccounts).toHaveLength(1);
  });
  it('rechecks recovery state after a customer response returns from the network', async () => {
    let release!: () => void, enter!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    EntitySyncEngine.configureTransport({ push: async () => ({ results: [], serverTime: '' }), pull: async () => {
      enter(); await gate; return { entities: [entity()], latestSeq: 9, serverTime: entity().updatedAt };
    } });
    const task = EntitySyncEngine.catchUp('CUSTOMER', consumer('customerAccounts'));
    await entered;
    try {
      const saved = await db.commitFinancialMutation('b'.repeat(64), () => ({ orderId: 'inflight-operation' }));
      release(); expect(await task).toEqual({ pulled: 0 });
      expect(db.customerAccounts).toHaveLength(0); expect(KeyValueStore.get(cursorKey('CUSTOMER'))).not.toBe('seq:9');
      await db.acknowledgeFinancialMutation(saved.operationId);
    } finally { release(); await task; }
  });
  it('advances an empty page without rebroadcasting unchanged business collections', async () => {
    connect([]); const notify = vi.spyOn(db, 'notify');
    expect(await EntitySyncEngine.catchUp('MENU_CATEGORY', consumer('categories'))).toEqual({ pulled: 0 });
    expect(KeyValueStore.get(cursorKey('MENU_CATEGORY'))).toBe('seq:9'); expect(notify).not.toHaveBeenCalled();
  });
});
