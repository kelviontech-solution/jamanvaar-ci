import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KeyValueStore } from '../packages/database/src/key_value_store';
import type { DbStorage } from '../packages/database/src/db';
import { EndpointResolver } from '../packages/sync/src/endpoint_resolver';

const fake = (): DbStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};
const g = globalThis as unknown as { localStorage?: DbStorage };
let saved: DbStorage | undefined;
beforeEach(() => { saved = g.localStorage; KeyValueStore.reset(); });
afterEach(() => { g.localStorage = saved; KeyValueStore.reset(); });

describe('the key-value storage port (cursors, settings) does not depend on a browser API', () => {
  it('works with no localStorage at all: nothing throws, reads are empty', () => {
    g.localStorage = undefined;
    expect(() => KeyValueStore.set('k', 'v')).not.toThrow();
    expect(KeyValueStore.get('k')).toBeNull();
    expect(() => KeyValueStore.remove('k')).not.toThrow();
  });

  it('uses the durable (SQLite) store once attached, and a value only in old localStorage is migrated on first read', () => {
    const ls = fake();
    g.localStorage = ls;
    ls.setItem('jamanvaar_order_sync_cursor', 'seq:42');
    const durable = fake();
    KeyValueStore.attach(durable);
    expect(KeyValueStore.get('jamanvaar_order_sync_cursor')).toBe('seq:42');
    expect(durable.data.get('jamanvaar_order_sync_cursor')).toBe('seq:42'); // copied across

    KeyValueStore.set('jamanvaar_order_sync_cursor', 'seq:43');
    expect(durable.data.get('jamanvaar_order_sync_cursor')).toBe('seq:43');
    expect(ls.data.get('jamanvaar_order_sync_cursor')).toBe('seq:42'); // new writes no longer touch localStorage

    KeyValueStore.remove('jamanvaar_order_sync_cursor');
    expect(KeyValueStore.get('jamanvaar_order_sync_cursor')).toBeNull(); // not resurrected from the old copy
  });

  it('the Branch Core address (a sync setting) is stored through the port, so it survives in SQLite', () => {
    g.localStorage = undefined;
    const durable = fake();
    KeyValueStore.attach(durable);
    EndpointResolver.reset();
    EndpointResolver.setCoreUrl('http://192.168.1.10:5178');
    expect([...durable.data.values()]).toContain('http://192.168.1.10:5178');
    EndpointResolver.reset();
    EndpointResolver.setCoreUrl(null);
  });
});
