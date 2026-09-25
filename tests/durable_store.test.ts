import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqlKvEngine } from '../packages/database/src/durable/sql_kv_engine';
import { NodeSqliteDriver } from '../packages/database/src/durable/node_driver';
import { DurableStorage, EngineBackend, migrateFromLocalStorage } from '../packages/database/src/durable/durable_storage';

let dir: string;
const file = () => join(dir, 'test.sqlite3');
const newEngine = () => new SqlKvEngine(new NodeSqliteDriver(file()));

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'jv-durable-')); });
afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* windows may hold the file briefly */ } });

const rows = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ id: `r${from + i}`, v: from + i }));

describe('SqlKvEngine', () => {
  it('persists plain values and reloads them from disk', () => {
    const e = newEngine();
    e.init();
    e.applyBatch([{ op: 'set', key: 'p_settings', value: '{"a":1}' }, { op: 'set', key: 'p_flag', value: 'true' }]);
    e.close();

    const again = newEngine();
    again.init();
    expect(again.loadAll()).toEqual({ p_settings: '{"a":1}', p_flag: 'true' });
  });

  it('a batch is atomic: if one operation fails, none of it is applied', () => {
    const e = newEngine();
    e.init();
    e.applyBatch([{ op: 'set', key: 'k', value: 'before' }]);
    expect(() => e.applyBatch([{ op: 'set', key: 'k', value: 'after' }, { op: 'set', key: 'bad', value: undefined as never }])).toThrow();
    expect(e.loadAll().k).toBe('before');
    expect('bad' in e.loadAll()).toBe(false);
  });

  it('stores arrays of records row by row and only rewrites the rows that changed', () => {
    const e = newEngine();
    e.init();
    e.applyBatch([{ op: 'set', key: 'p_orders', value: JSON.stringify(rows(50)) }]);
    expect(e.lastRowWrites).toBe(50);

    const changed = rows(50);
    changed[10] = { id: 'r10', v: 999 };
    e.applyBatch([{ op: 'set', key: 'p_orders', value: JSON.stringify(changed) }]);
    expect(e.lastRowWrites).toBe(1);
    expect(JSON.parse(e.loadAll().p_orders)[10]).toEqual({ id: 'r10', v: 999 });
  });

  it('keeps array order through inserts at the front, back and middle, deletes and reorders', () => {
    const e = newEngine();
    e.init();
    const write = (list: unknown[]) => e.applyBatch([{ op: 'set', key: 'p_list', value: JSON.stringify(list) }]);
    const read = () => (JSON.parse(e.loadAll().p_list) as Array<{ id: string }>).map((r) => r.id);

    write(rows(3)); // r0 r1 r2
    write([{ id: 'front' }, ...rows(3)]);
    expect(read()).toEqual(['front', 'r0', 'r1', 'r2']);
    expect(e.lastRowWrites).toBe(1); // a new item at the front must not rewrite everything

    write([{ id: 'front' }, ...rows(3), { id: 'back' }]);
    expect(read()).toEqual(['front', 'r0', 'r1', 'r2', 'back']);

    write([{ id: 'front' }, { id: 'r0', v: 0 }, { id: 'mid' }, { id: 'r1', v: 1 }, { id: 'r2', v: 2 }, { id: 'back' }]);
    expect(read()).toEqual(['front', 'r0', 'mid', 'r1', 'r2', 'back']);

    write([{ id: 'front' }, { id: 'mid' }, { id: 'back' }]);
    expect(read()).toEqual(['front', 'mid', 'back']);

    write([{ id: 'back' }, { id: 'front' }, { id: 'mid' }]);
    expect(read()).toEqual(['back', 'front', 'mid']);
  });

  it('remembers an empty array as empty rather than as missing', () => {
    const e = newEngine();
    e.init();
    e.applyBatch([{ op: 'set', key: 'p_orders', value: JSON.stringify(rows(2)) }]);
    e.applyBatch([{ op: 'set', key: 'p_orders', value: '[]' }]);
    e.close();
    const again = newEngine();
    again.init();
    expect(again.loadAll().p_orders).toBe('[]');
  });

  it('handles a key changing shape between a record list and a plain value, and removal', () => {
    const e = newEngine();
    e.init();
    e.applyBatch([{ op: 'set', key: 'x', value: JSON.stringify(rows(2)) }]);
    e.applyBatch([{ op: 'set', key: 'x', value: '"plain"' }]);
    expect(e.loadAll().x).toBe('"plain"');
    e.applyBatch([{ op: 'set', key: 'x', value: JSON.stringify(rows(1)) }]);
    expect(JSON.parse(e.loadAll().x)).toEqual(rows(1));
    e.applyBatch([{ op: 'remove', key: 'x' }]);
    expect('x' in e.loadAll()).toBe(false);
  });

  it('treats a list without unique string ids as a plain value (nothing is lost)', () => {
    const e = newEngine();
    e.init();
    const odd = [{ id: 'a' }, { id: 'a' }, { name: 'no id' }];
    e.applyBatch([{ op: 'set', key: 'odd', value: JSON.stringify(odd) }]);
    expect(JSON.parse(e.loadAll().odd)).toEqual(odd);
  });
});

describe('DurableStorage', () => {
  it('reads what was just written, synchronously', async () => {
    const s = await DurableStorage.open(new EngineBackend(newEngine()));
    s.setItem('a', '1');
    expect(s.getItem('a')).toBe('1');
    s.removeItem('a');
    expect(s.getItem('a')).toBeNull();
  });

  it('writes everything set in one tick as one atomic batch', async () => {
    const backend = new EngineBackend(newEngine());
    const s = await DurableStorage.open(backend);
    s.setItem('orders', JSON.stringify(rows(2)));
    s.setItem('kots', JSON.stringify(rows(2, 10)));
    s.setItem('journal', 'x');
    await s.flush();
    expect(backend.batches).toHaveLength(1);
    expect(backend.batches[0]).toHaveLength(3);
  });

  it('survives a restart: a new storage on the same file sees the data', async () => {
    const s = await DurableStorage.open(new EngineBackend(newEngine()));
    s.setItem('orders', JSON.stringify(rows(3)));
    s.setItem('cfg', 'hello');
    await s.flush();
    s.close();

    const restarted = await DurableStorage.open(new EngineBackend(newEngine()));
    expect(restarted.getItem('cfg')).toBe('hello');
    expect(JSON.parse(restarted.getItem('orders')!)).toEqual(rows(3));
  });

  it('reports a failing backend, keeps the changes, and retries until they are durable', async () => {
    const backend = new EngineBackend(newEngine());
    const s = await DurableStorage.open(backend, { retryMs: 5 });
    backend.failNext = 2;
    s.setItem('k', 'v');
    await s.flush().catch(() => undefined);
    expect(s.health().ok).toBe(false);
    expect(s.getItem('k')).toBe('v');

    await new Promise((r) => setTimeout(r, 60));
    await s.flush();
    expect(s.health().ok).toBe(true);
    s.close();
    const again = await DurableStorage.open(new EngineBackend(newEngine()));
    expect(again.getItem('k')).toBe('v');
  });

  it('ops queued while a batch is being written are not lost or reordered', async () => {
    const s = await DurableStorage.open(new EngineBackend(newEngine()));
    s.setItem('k', '1');
    const first = s.flush();
    s.setItem('k', '2');
    await first;
    await s.flush();
    s.close();
    expect((await DurableStorage.open(new EngineBackend(newEngine()))).getItem('k')).toBe('2');
  });
});

describe('migrateFromLocalStorage', () => {
  const fakeLs = (entries: Record<string, string>) => {
    const m = new Map(Object.entries(entries));
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
  };

  it('copies this app\'s keys into SQLite once and leaves the originals as a backup', async () => {
    const ls = fakeLs({ 'jv_orders': JSON.stringify(rows(2)), 'jv_users': '[]', 'other_app_key': 'x' });
    const s = await DurableStorage.open(new EngineBackend(newEngine()));
    const first = await migrateFromLocalStorage(s, ls, 'jv_');
    expect(first).toEqual({ migrated: 2 });
    expect(JSON.parse(s.getItem('jv_orders')!)).toEqual(rows(2));
    expect(s.getItem('other_app_key')).toBeNull();
    expect(ls.getItem('jv_orders')).not.toBeNull();

    const second = await migrateFromLocalStorage(s, ls, 'jv_');
    expect(second).toEqual({ migrated: 0 });
  });

  it('never overwrites data that is already in SQLite', async () => {
    const s = await DurableStorage.open(new EngineBackend(newEngine()));
    s.setItem('jv_orders', 'newer');
    await s.flush();
    const ls = fakeLs({ 'jv_orders': 'stale', 'jv_extra': 'x' });
    await migrateFromLocalStorage(s, ls, 'jv_');
    expect(s.getItem('jv_orders')).toBe('newer');
  });
});
