import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, KeyValueStore, MenuRepository, RestaurantIdentityRepository, TableSync } from '@jamanvaar/database';
import { EntitySyncEngine } from '@jamanvaar/sync';

/**
 * Re-activating a tablet for the restaurant it already served (a reset, a replaced key) wipes the tablet's local
 * menu and floor. Two things went wrong: the sync cursors stayed at "now" so nothing was ever downloaded again (an
 * empty Captain menu), and the floor-plan sync read every wiped table as "deleted here" and pushed those deletions
 * to the cloud, removing the restaurant's tables from every device.
 */
const store = new Map<string, string>();
const g = globalThis as unknown as { localStorage: unknown };
let saved: unknown;

beforeEach(() => {
  saved = g.localStorage;
  store.clear();
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  KeyValueStore.reset();
  db.resetToDefaultSeed();
});
afterEach(() => {
  g.localStorage = saved;
});

describe('re-activation on the same restaurant', () => {
  it('does not turn the wiped tables into deletions that reach the cloud', () => {
    TableSync.stampChanges(); // the tablet has synced before: its tables are known
    expect(db.tables.length).toBeGreaterThan(0);

    RestaurantIdentityRepository.startFreshOperations();
    TableSync.stampChanges();

    const deletions = TableSync.collectSyncRecords().filter((r) => r.payload.deleted === true);
    expect(deletions).toEqual([]);
  });

  it('still records a deletion when a person deletes a table', () => {
    TableSync.stampChanges();
    const id = db.tables[0].id;
    TableSync.recordDeletion(id);
    expect(TableSync.collectSyncRecords().some((r) => r.externalId === id && r.payload.deleted === true)).toBe(true);
  });

  it('restarts the menu, floor and promotion pulls from the beginning', () => {
    for (const t of ['MENU_ITEM', 'MENU_CATEGORY', 'MODIFIER_GROUP', 'COMBO', 'COUPON', 'DINING_TABLE']) store.set(`jamanvaar_entity_sync_cursor_${t}`, '2026-09-28T10:00:00.000Z');
    store.set('jamanvaar_entity_sync_cursor_STAFF_USER', '2026-09-28T10:00:00.000Z');
    store.set('jamanvaar_menu_applied_version', '3');

    MenuRepository.startFreshMenu();
    RestaurantIdentityRepository.startFreshOperations();

    for (const t of ['MENU_ITEM', 'MENU_CATEGORY', 'MODIFIER_GROUP', 'COMBO', 'COUPON', 'DINING_TABLE']) expect(store.has(`jamanvaar_entity_sync_cursor_${t}`)).toBe(false);
    expect(store.has('jamanvaar_menu_applied_version')).toBe(false);
    // Staff were not wiped, so their cursor stays.
    expect(store.has('jamanvaar_entity_sync_cursor_STAFF_USER')).toBe(true);
  });
});

describe('a device whose menu is empty but whose cursor says it is up to date', () => {
  it('pulls the whole list again, once per session', async () => {
    const since: string[] = [];
    EntitySyncEngine.configureTransport({
      push: async () => ({ results: [], serverTime: new Date().toISOString() }),
      pull: async (_type: string, s?: string) => {
        since.push(s ?? '');
        return { entities: [], serverTime: '2026-09-28T11:00:00.000Z' };
      }
    } as never);
    store.set('jamanvaar_entity_sync_cursor_HEAL_TEST', '2026-09-28T10:00:00.000Z');

    EntitySyncEngine.restartFromBeginning('HEAL_TEST');
    await EntitySyncEngine.catchUp('HEAL_TEST', () => undefined);
    expect(since[0]).toBe(new Date(0).toISOString());

    // Second call in the same session does nothing: the cursor set by the pull above is kept.
    EntitySyncEngine.restartFromBeginning('HEAL_TEST');
    await EntitySyncEngine.catchUp('HEAL_TEST', () => undefined);
    expect(since[1]).toBe('2026-09-28T11:00:00.000Z');
    EntitySyncEngine.configureTransport(null);
  });
});
