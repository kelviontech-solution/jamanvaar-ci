import { DurableStorage, type StorageHooks } from '../packages/database/src/durable/durable_storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { db, KeyValueStore, KOTRepository, bootDurableStorage, resetEntitySyncCursors } from '@jamanvaar/database';
import { SyncOutboxEngine, EntitySyncEngine, EndpointResolver, DeviceGate, syncStaffUsers } from '@jamanvaar/sync';
import { fetchWithDeadline, RequestTimeoutError } from '@jamanvaar/api';
import { WorkerBackend } from '../packages/database/src/durable/worker_backend';

const store = new Map<string, string>();
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k), key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; } });
  store.clear(); KeyValueStore.reset(); EndpointResolver.reset(); EndpointResolver.setIdentity(null);
  db.orders = []; db.kots = []; db.syncEvents = [];
});
afterEach(() => { SyncOutboxEngine.configureTransport(null); EntitySyncEngine.configureTransport(null); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('production synchronization recovery', () => {
  it('uploads a 201-order offline backlog in legal batches', async () => {
    db.orders = Array.from({ length: 201 }, (_, i) => ({ id: `o-${i}`, updatedAt: new Date().toISOString(), items: [], syncStatus: 'SAVED_LOCALLY' } as never));
    const sizes: number[] = [];
    SyncOutboxEngine.configureTransport({ push: async (events) => { sizes.push(events.length); return { serverTime: new Date().toISOString(), results: events.map((e) => ({ externalOrderId: e.externalOrderId, status: 'ok' as const })) }; }, pull: async () => ({ orders: [], latestSeq: 0, serverTime: new Date().toISOString() }) });
    expect((await SyncOutboxEngine.processOutbox()).processed).toBe(201);
    expect(sizes).toEqual([100, 100, 1]);
    expect(db.orders.every((o) => o.syncStatus === 'SYNCED')).toBe(true);
  });

  it('resumes an order saved during an interrupted upload', async () => {
    db.orders = [{ id: 'interrupted', updatedAt: new Date().toISOString(), items: [], syncStatus: 'SYNCING' } as never];
    const push = vi.fn(async (events) => ({ serverTime: new Date().toISOString(), results: events.map((e: any) => ({ externalOrderId: e.externalOrderId, status: 'ok' })) }));
    SyncOutboxEngine.configureTransport({ push, pull: async () => ({ orders: [], serverTime: new Date().toISOString() }) });
    await SyncOutboxEngine.processOutbox();
    expect(push).toHaveBeenCalledOnce(); expect(db.orders[0].syncStatus).toBe('SYNCED');
  });

  it('does not acknowledge an order update deferred behind local changes', async () => {
    vi.spyOn(KOTRepository, 'reconcileWithOrders').mockImplementation(() => 0);
    db.orders = [{ id: 'pending', remoteSeq: 8, updatedAt: '2026-10-01T00:00:00.000Z', items: [], syncStatus: 'SAVED_LOCALLY', orderStatus: 'PREPARING' } as never];
    const pull = vi.fn(async () => ({ orders: [{ externalOrderId: 'pending', seq: 9, status: 'READY', items: [], updatedAt: '2026-10-02T00:00:00.000Z' } as never], latestSeq: 9, hasMore: false, serverTime: new Date().toISOString() }));
    SyncOutboxEngine.configureTransport({ push: vi.fn(), pull });
    await SyncOutboxEngine.catchUpFromCloud();
    expect(store.has('jamanvaar_order_sync_cursor')).toBe(false);
    db.orders[0].syncStatus = 'SYNCED';
    await SyncOutboxEngine.catchUpFromCloud();
    expect(pull.mock.calls).toHaveLength(2);
    expect(db.orders[0].orderStatus).toBe('READY');
    expect(store.get('jamanvaar_order_sync_cursor')).toBe('seq:9');
  });

  it('drains filtered pages using the scanned sequence even when a page is empty', async () => {
    const seen: string[] = [];
    const pull = vi.fn(async (_type: string, cursor?: string) => cursor === 'seq:0'
      ? { entities: [], latestSeq: 500, hasMore: true, serverTime: new Date().toISOString() }
      : { entities: [{ externalId: 'table-A', payload: {}, updatedAt: new Date().toISOString() }], latestSeq: 501, hasMore: false, serverTime: new Date().toISOString() });
    EntitySyncEngine.configureTransport({ push: vi.fn(), pull });
    await EntitySyncEngine.catchUp('DINING_TABLE', (e) => seen.push(e.externalId));
    expect(seen).toEqual(['table-A']); expect(pull.mock.calls.map((c) => c[1])).toEqual(['seq:0', 'seq:500']);
  });

  it('never puts an authenticated API response in either app shell cache', () => {
    for (const app of ['kds', 'captain']) {
      let handler: (event: any) => void = () => undefined;
      const respondWith = vi.fn();
      runInNewContext(readFileSync(`apps/restaurant-system/${app}/public/sw.js`, 'utf8'), {
        self: { location: { origin: 'https://system.example' }, registration: { scope: `https://system.example/${app}/` }, addEventListener: (name: string, fn: any) => { if (name === 'fetch') handler = fn; } }, URL
      });
      handler({ request: new Request('https://system.example/api/v1/orders/sync?afterSeq=0', { headers: { Authorization: 'Bearer example' } }), respondWith });
      expect(respondWith).not.toHaveBeenCalled();
    }
  });

  it('bounds a stalled response body and preserves caller cancellation', async () => {
    const fetcher = vi.fn(async (_url, init) => new Response(new ReadableStream({ start(controller) { init.signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError'))); } })));
    await expect(fetchWithDeadline('https://example.test/api', {}, 15, fetcher as never)).rejects.toBeInstanceOf(RequestTimeoutError);
  });

  it('rejects stalled SQLite initialization and terminates its worker', async () => {
    const worker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null };
    await expect(new WorkerBackend(worker, 'regression', 15).load()).rejects.toThrow('did not finish');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it('keeps fallback data, cursors and disconnect flags separate for apps on the same origin', async () => {
    vi.stubGlobal('navigator', {}); vi.stubGlobal('Worker', undefined);
    await bootDurableStorage({ appId: 'pos' });
    KeyValueStore.set('jamanvaar_order_sync_cursor', 'seq:9');
    DeviceGate.disconnectTerminal();
    expect(store.get('jamanvaar_app_pos:jamanvaar_gate_disconnected')).toBe('1');
    await bootDurableStorage({ appId: 'kds' });
    expect(KeyValueStore.get('jamanvaar_order_sync_cursor')).toBeNull();
    expect(store.get('jamanvaar_app_kds:jamanvaar_gate_disconnected')).toBeUndefined();
    KeyValueStore.set('jamanvaar_order_sync_cursor', 'seq:2');
    await bootDurableStorage({ appId: 'pos' });
    expect(KeyValueStore.get('jamanvaar_order_sync_cursor')).toBe('seq:9');
  });

  it('delivers persisted remote updates to every subscriber', async () => {
    let hooks!: StorageHooks;
    const storage = await DurableStorage.open({ attach: (h) => { hooks = h; }, load: async () => ({}), write: async () => undefined, close: () => undefined });
    const one = vi.fn(); const two = vi.fn();
    storage.subscribeRemote(one); const removeTwo = storage.subscribeRemote(two);
    hooks.remote([{ op: 'set', key: 'record', value: 'one' }]);
    expect(one).toHaveBeenCalledOnce(); expect(two).toHaveBeenCalledOnce();
    removeTwo(); hooks.remote([{ op: 'set', key: 'record', value: 'two' }]);
    expect(one).toHaveBeenCalledTimes(2); expect(two).toHaveBeenCalledOnce(); expect(storage.getItem('record')).toBe('two');
    storage.close();
  });

  it('pushes staff edits once and sends no repeated full staff snapshot on the next tick', async () => {
    db.users = [{ id: 'staff-delta', fullName: 'Delta', roleId: 'cashier', isActive: true, updatedAt: '2026-10-01T00:00:00Z' } as never];
    const push = vi.fn(async (_type, records) => ({ results: records.map((r: any) => ({ externalId: r.externalId, status: 'ok' as const })), serverTime: new Date().toISOString() }));
    EntitySyncEngine.configureTransport({ push, pull: async () => ({ entities: [], latestSeq: 0, serverTime: new Date().toISOString() }) });
    await syncStaffUsers({ push: true }); await syncStaffUsers({ push: true });
    expect(push).toHaveBeenCalledOnce();
    db.users[0].fullName = 'Edited'; db.users[0].updatedAt = '2026-10-02T00:00:00Z';
    await syncStaffUsers({ push: true }); expect(push).toHaveBeenCalledTimes(2);
  });

  it('holds the cursor belonging to a core response even if another request changes the global responder', async () => {
    EndpointResolver.configure({ cloudBase: 'https://cloud.test', coreUrl: 'https://core.test' });
    EndpointResolver.setIdentity('routing-test');
    EntitySyncEngine.configureTransport({ push: vi.fn(), pull: async () => {
      await EndpointResolver.fetch('/api/v1/menu/version', {}, async () => new Response('{}'));
      return { entities: [], latestSeq: 42, hasMore: false, serverKey: 'core', serverTime: new Date().toISOString() };
    } });
    await EntitySyncEngine.catchUp('MENU_ITEM', () => undefined);
    expect(KeyValueStore.get('jamanvaar_entity_sync_cursor_MENU_ITEM:device:routing-test:core')).toBe('seq:42');
  });

  it('starts a scoped device cursor over when its local menu is cleared', () => {
    KeyValueStore.set('jamanvaar_entity_sync_cursor_MENU_ITEM:device:old:branch:core', 'seq:99');
    KeyValueStore.set('jamanvaar_entity_sync_cursor_MENU_ITEM:device:old:branch:core:caught_up_at', '2026-10-01');
    resetEntitySyncCursors(['MENU_ITEM']);
    expect(KeyValueStore.keys().filter((key) => key.startsWith('jamanvaar_entity_sync_cursor_MENU_ITEM'))).toEqual([]);
  });

  it('splits a large order upload by bytes as well as by the record count', async () => {
    db.orders = ['large-1', 'large-2'].map((id) => ({ id, updatedAt: new Date().toISOString(), items: [], customerNotes: 'x'.repeat(900000), syncStatus: 'SAVED_LOCALLY' } as never));
    const push = vi.fn(async (events) => ({ serverTime: new Date().toISOString(), results: events.map((e: any) => ({ externalOrderId: e.externalOrderId, status: 'ok' as const })) }));
    SyncOutboxEngine.configureTransport({ push, pull: vi.fn() });
    await SyncOutboxEngine.processOutbox();
    expect(push.mock.calls.map((call) => call[0].length)).toEqual([1, 1]);
  });

});
