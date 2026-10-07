// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bootDurableStorage } from '../packages/database/src/durable/browser_boot';
import { db, JamanvaarDatabase } from '../packages/database/src/db';
import { KeyValueStore } from '../packages/database/src/key_value_store';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('Worker', undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  KeyValueStore.setBrowserNamespace('');
  (db as any).store = null;
});

it('an empty selected branch never imports legacy tables or creates demo tables', async () => {
  for (const prefix of JamanvaarDatabase.knownPrefixes()) localStorage.setItem(`${prefix}tables`, JSON.stringify([{ id: 'foreign-table', tableNumber: 'OTHER' }]));
  localStorage.setItem('jamanvaar_tenant_id', 'restaurant');
  await bootDurableStorage({ appId: 'pos-admin-restaurant-branch-a', restaurantId: 'restaurant', migrateLegacy: false });
  expect(db.tables).toEqual([]);
  expect(localStorage.getItem('jamanvaar_app_pos-admin-restaurant-branch-a:__app_scope_migrated')).toBe('1');
});

it('switching branch caches preserves existing tables and isolates pending edits', async () => {
  const key = JamanvaarDatabase.knownPrefixes()[0];
  localStorage.setItem(`jamanvaar_app_pos-admin-restaurant-branch-a:${key}tables`, JSON.stringify([{ id: 'table-a', tableNumber: 'A1' }]));
  await bootDurableStorage({ appId: 'pos-admin-restaurant-branch-a', migrateLegacy: false });
  expect(db.tables.map(t => t.id)).toEqual(['table-a']);
  KeyValueStore.set('branch-unsent-edit', 'queue-a');
  await bootDurableStorage({ appId: 'pos-admin-restaurant-branch-b', migrateLegacy: false });
  expect(db.tables).toEqual([]);
  expect(KeyValueStore.get('branch-unsent-edit')).toBeNull();
  await bootDurableStorage({ appId: 'pos-admin-restaurant-branch-a', migrateLegacy: false });
  expect(db.tables.map(t => t.id)).toEqual(['table-a']);
  expect(KeyValueStore.get('branch-unsent-edit')).toBe('queue-a');
});
