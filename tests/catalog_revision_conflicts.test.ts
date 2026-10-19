import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CollectionSync, KeyValueStore } from '@jamanvaar/database';
import { EntitySyncEngine, syncCollection, catalogRevisionScope } from '@jamanvaar/sync';
type Dish = { id: string; name: string; price: number; updatedAt?: string };
const baseline: Dish = { id: 'dish', name: 'Thepla', price: 70, updatedAt: '2026-10-01T00:00:00.000Z' };
const scope = 'restaurant:branch:device:cloud';
const savedStorage = globalThis.localStorage;
let list: Dish[], sync: CollectionSync<Dish>;
beforeEach(() => {
  const values = new Map<string, string>();
  globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); }, removeItem: k => { values.delete(k); }, clear: () => values.clear(), key: i => [...values.keys()][i] ?? null, get length() { return values.size; } };
  KeyValueStore.reset(); list = [];
  sync = new CollectionSync<Dish>('revision-test', () => list, r => typeof r.name === 'string');
  sync.applyRemote(baseline, { scope, syncVersion: 1 }); sync.stampChanges();
});
afterEach(() => { EntitySyncEngine.configureTransport(null); KeyValueStore.reset(); globalThis.localStorage = savedStorage; });
const edit = (price = 90) => { list[0].price = price; sync.stampChanges('2050-01-01T00:00:00.000Z'); };
const remote = (price = 80) => ({ ...baseline, price });

describe('server revision catalog review', () => {
  it('keeps a pending edit when the published baseline has not changed', () => {
    edit(); sync.applyRemote(baseline, { scope, syncVersion: 1 });
    expect(sync.getConflicts(scope)).toEqual([]);
    expect(sync.collectSyncRecords(scope)[0]).toMatchObject({ baseSyncVersion: 1, payload: { price: 90 } });
  });
  it('preserves both versions despite a future client clock and blocks blind publication', () => {
    edit(); sync.applyRemote(remote(), { scope, syncVersion: 2 });
    expect(list[0].price).toBe(90);
    expect(sync.getConflicts(scope)[0]).toMatchObject({ local: { price: 90 }, remote: { price: 80 }, syncVersion: 2 });
    expect(sync.collectSyncRecords(scope)).toEqual([]);
  });
  it('retains pending conflicts after a new client instance loads the same storage', () => {
    edit(); sync.applyRemote(remote(), { scope, syncVersion: 2 });
    sync = new CollectionSync<Dish>('revision-test', () => list, () => true);
    expect(sync.getConflicts(scope)).toHaveLength(1);
    expect(sync.collectSyncRecords(scope)).toEqual([]);
  });
  it('uses the reviewed revision for an explicit local choice, never the old revision', () => {
    edit(); sync.applyRemote(remote(), { scope, syncVersion: 2 });
    sync.resolveConflict(sync.getConflicts(scope)[0], 'LOCAL');
    expect(sync.collectSyncRecords(scope)[0]).toMatchObject({ baseSyncVersion: 2, payload: { price: 90 } });
    expect(Date.parse(list[0].updatedAt!)).toBeLessThan(Date.parse('2050-01-01T00:00:00Z'));
  });
  it('rejects an outdated comparison if either administrator changed it again', () => {
    edit(); sync.applyRemote(remote(), { scope, syncVersion: 2 });
    const shown = sync.getConflicts(scope)[0];
    list[0].price = 95;
    expect(() => sync.resolveConflict(shown, 'LOCAL')).toThrow('comparison changed');
    const second = sync.getConflicts(scope)[0];
    sync.applyRemote(remote(85), { scope, syncVersion: 3 });
    expect(() => sync.resolveConflict(second, 'SERVER')).toThrow('comparison changed');
  });
  it('accepts the published version and cannot resurrect a removed record', () => {
    edit(); sync.applyRemote({ id: 'dish', deleted: true, updatedAt: baseline.updatedAt }, { scope, syncVersion: 2 });
    const conflict = sync.getConflicts(scope)[0];
    expect(() => sync.resolveConflict(conflict, 'LOCAL')).toThrow('record was removed');
    sync.resolveConflict(conflict, 'SERVER');
    expect(list).toEqual([]); expect(sync.collectSyncRecords(scope)).toEqual([]);
  });
  it('does not lose a pending deletion when the unchanged server baseline is pulled first', () => {
    list = []; sync.recordDeletion('dish'); sync.applyRemote(baseline, { scope, syncVersion: 1 });
    expect(sync.getConflicts(scope)).toEqual([]);
    expect(sync.collectSyncRecords(scope)[0]).toMatchObject({ baseSyncVersion: 1, payload: { deleted: true } });
  });
  it('takes a clean server revision regardless of the descriptive timestamp', () => {
    list[0].updatedAt = '2050-01-01T00:00:00.000Z';
    sync.applyRemote(remote(), { scope, syncVersion: 2 });
    expect(list[0].price).toBe(80);
    expect(sync.collectSyncRecords(scope)).toEqual([]);
    sync.applyRemote(baseline, { scope, syncVersion: 1 });
    expect(list[0].price).toBe(80);
  });
  it('keeps edits made during an acknowledged push and advances only its accepted base revision', () => {
    edit(80); const sent = sync.collectSyncRecords(scope);
    edit(90); sync.markPushed(sent, { scope, syncVersion: 2 });
    sync.applyRemote(remote(), { scope, syncVersion: 2 });
    expect(sync.collectSyncRecords(scope)[0]).toMatchObject({ baseSyncVersion: 2, payload: { price: 90 } });
  });
  it('does not reuse cloud revisions at another server or identity', () => {
    edit(); expect(sync.collectSyncRecords('restaurant:branch:device:core')[0].baseSyncVersion).toBe(0);
  });
  it('refreshes and preserves work after a write conflict that occurs between pull and push', async () => {
    const actualScope = catalogRevisionScope('MENU_ITEM');
    sync.applyRemote(baseline, { scope: actualScope, syncVersion: 1 }); edit();
    let pulls = 0;
    EntitySyncEngine.configureTransport({
      pull: async () => ({ entities: [{ externalId: 'dish', payload: pulls++ ? remote() : baseline, syncVersion: pulls > 1 ? 2 : 1, updatedAt: baseline.updatedAt! }], latestSeq: pulls, serverTime: new Date().toISOString() }),
      push: async (_type, events) => {
        expect(events[0].baseSyncVersion).toBe(1);
        return { results: [{ externalId: 'dish', status: 'error', error: 'ENTITY_VERSION_CONFLICT' }], serverTime: new Date().toISOString() };
      }
    });
    await syncCollection('MENU_ITEM', sync, true);
    expect(pulls).toBe(2);
    expect(list[0].price).toBe(90);
    expect(sync.getConflicts(actualScope)[0].remote.price).toBe(80);
  });
  it('counts only acknowledgements for the requested IDs and rejects an omitted result', async () => {
    EntitySyncEngine.configureTransport({ push: async () => ({ results: [{ externalId: 'unsolicited', status: 'ok' }, { externalId: 'one', status: 'ok' }, { externalId: 'one', status: 'ok' }], serverTime: '' }), pull: async () => ({ entities: [], serverTime: '' }) });
    expect(await EntitySyncEngine.pushSnapshot('MENU_ITEM', [{ externalId: 'one', payload: {} }, { externalId: 'two', payload: {} }])).toEqual({ processed: 1, failed: 1 });
  });
});
