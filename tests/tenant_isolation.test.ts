import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../packages/database/src/db';
import { KeyValueStore } from '../packages/database/src/key_value_store';
import { TenantIsolation } from '../packages/database/src/tenant_isolation';

const store = new Map<string, string>();
const g = globalThis as any;
let saved: unknown;
beforeEach(() => {
  saved = g.localStorage;
  store.clear();
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  KeyValueStore.reset();
  db.users = [{ id: 'u1', fullName: 'Priya Cashier', isActive: true, roleId: 'cashier' } as never];
  db.orders = [{ id: 'old-synced', syncStatus: 'SYNCED' } as never, { id: 'old-unsent', syncStatus: 'SAVED_LOCALLY' } as never];
  db.shifts = [{ id: 's1' } as never];
  db.customerAccounts = [{ phone: '9', name: 'Old Guest' } as never];
});
afterEach(() => { g.localStorage = saved; db.users = []; db.orders = []; db.shifts = []; db.customerAccounts = []; });

describe('one device, one restaurant', () => {
  it('activating for a different restaurant removes the previous restaurant\'s staff, orders, shifts and customers and its sync cursors', () => {
    store.set('jamanvaar_tenant_id', 'rest-A');
    store.set('jamanvaar_order_sync_cursor', 'seq:99');
    store.set('jamanvaar_entity_sync_cursor_STAFF_USER', '2026-01-01T00:00:00Z');
    const r = TenantIsolation.enter('rest-B');
    expect(r.wiped).toBe(true);
    expect(db.users).toEqual([]);
    expect(db.orders).toEqual([]);
    expect(db.shifts).toEqual([]);
    expect(db.customerAccounts).toEqual([]);
    expect(store.has('jamanvaar_order_sync_cursor')).toBe(false); // new restaurant downloads from the start
    expect(store.has('jamanvaar_entity_sync_cursor_STAFF_USER')).toBe(false);
    expect(TenantIsolation.current()).toBe('rest-B');
  });

  it('unsent orders of the old restaurant are set aside, never shown or synced for the new one', () => {
    store.set('jamanvaar_tenant_id', 'rest-A');
    const r = TenantIsolation.enter('rest-B');
    expect(r.quarantined).toBe(1);
    const key = [...store.keys()].find((k) => k.startsWith('jamanvaar_quarantine_rest-A_'))!;
    expect(JSON.parse(store.get(key)!).map((o: any) => o.id)).toEqual(['old-unsent']);
    expect(db.orders).toEqual([]);
  });

  it('re-activating the same restaurant changes nothing', () => {
    store.set('jamanvaar_tenant_id', 'rest-A');
    expect(TenantIsolation.enter('rest-A').wiped).toBe(false);
    expect(db.users).toHaveLength(1);
    expect(db.orders).toHaveLength(2);
  });

  it('data of unknown ownership (an old install) is cleared at terminal activation, but Restaurant Admin adopts it instead', () => {
    const admin = TenantIsolation.enter('rest-B', { unknownIsForeign: false });
    expect(admin.wiped).toBe(false);
    expect(db.users).toHaveLength(1);
    expect(TenantIsolation.current()).toBe('rest-B');

    store.clear();
    KeyValueStore.reset();
    const terminal = TenantIsolation.enter('rest-B');
    expect(terminal.wiped).toBe(true);
    expect(db.users).toEqual([]);
  });

  it('"Start this device fresh" clears the local copy of the same restaurant so it is rebuilt from the cloud', () => {
    store.set('jamanvaar_tenant_id', 'rest-A');
    const r = TenantIsolation.reset('rest-A');
    expect(r.wiped).toBe(true);
    expect(db.users).toEqual([]);
    expect(TenantIsolation.current()).toBe('rest-A');
  });
});
