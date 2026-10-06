import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CollectionSync, KeyValueStore, db } from '@jamanvaar/database';
import { vi } from 'vitest';

type Dish = { id: string; name: string; categoryId: string; price: number; updatedAt?: string };
const original: Dish = { id: 'dish', name: 'Thepla', categoryId: 'breads', price: 70, updatedAt: '2026-10-06T10:00:00.000Z' };
const saved = globalThis.localStorage;
beforeEach(() => {
  const values = new Map<string, string>();
  globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); }, removeItem: k => { values.delete(k); }, clear: () => values.clear(), key: i => [...values.keys()][i] ?? null, get length() { return values.size; } };
  KeyValueStore.reset();
});
afterEach(() => { vi.restoreAllMocks(); KeyValueStore.reset(); globalThis.localStorage = saved; });

describe('menu sync across admin windows sharing durable storage', () => {
  it('does not stamp or re-upload another window\'s acknowledged menu edit', () => {
    let firstList = [structuredClone(original)], secondList = [structuredClone(original)];
    const first = new CollectionSync<Dish>('shared', () => firstList, r => typeof r.name === 'string');
    const second = new CollectionSync<Dish>('shared', () => secondList, r => typeof r.name === 'string');
    first.stampChanges(); first.markPushed(first.collectSyncRecords()); second.stampChanges();
    const remote = { ...original, name: 'Bajra Rotla', categoryId: 'rotla', updatedAt: '2026-10-06T10:01:00.000Z' };
    second.applyRemote(remote);
    // The actual durable-store callback reloads the first window's collection from SQLite.
    firstList = structuredClone(secondList);
    first.stampChanges('2026-10-06T10:02:00.000Z');
    expect(firstList[0].updatedAt).toBe(remote.updatedAt);
    expect(first.collectSyncRecords()).toEqual([]);
    // An unrelated notification must not cause either idle window to write the menu.
    secondList = structuredClone(firstList);
    second.stampChanges('2026-10-06T10:03:00.000Z');
    expect(second.collectSyncRecords()).toEqual([]);
  });

  it('retains a real edit made while a push is awaiting acknowledgement', () => {
    const list = [structuredClone(original)];
    const sync = new CollectionSync<Dish>('pending', () => list, () => true);
    sync.stampChanges(); const sent = sync.collectSyncRecords();
    list[0].price = 90; sync.stampChanges('2026-10-06T10:03:00.000Z');
    sync.markPushed(sent);
    expect(sync.collectSyncRecords()[0].payload.price).toBe(90);
  });

  it('keeps nested menu choices in a pending upload immutable until acknowledgement', () => {
    const list = [{ ...original, modifierGroupIds: ['original-group'] }];
    const sync = new CollectionSync<typeof list[number]>('nested', () => list, () => true);
    sync.stampChanges(); const sent = sync.collectSyncRecords();
    list[0].modifierGroupIds.push('new-group'); sync.stampChanges(); sync.markPushed(sent);
    expect(sent[0].payload.modifierGroupIds).toEqual(['original-group']);
    expect(sync.collectSyncRecords()[0].payload.modifierGroupIds).toEqual(['original-group', 'new-group']);
  });

  it('does not broadcast/render an identical acknowledged remote menu repeatedly', () => {
    const list = [structuredClone(original)];
    const sync = new CollectionSync<Dish>('repeat', () => list, () => true);
    sync.stampChanges(); sync.markPushed(sync.collectSyncRecords());
    const notify = vi.spyOn(db, 'notify');
    sync.applyRemote(original); sync.applyRemote(original);
    expect(notify).not.toHaveBeenCalled();
    expect(sync.collectSyncRecords()).toEqual([]);
  });
});
