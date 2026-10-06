import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, KeyValueStore, MenuRepository, StaffRepository } from '@jamanvaar/database';
import { EntitySyncEngine, syncMenuCatalog } from '@jamanvaar/sync';
import type { CloudSyncedEntity, EntitySyncEvent } from '@jamanvaar/sync';
import { useCaptainStore } from '../apps/restaurant-system/captain/src/store/captainStore';

/**
 * The Captain never edits the menu: it only receives what Restaurant Admin published. A Captain that shows
 * "All Dishes (0)" cannot take an order, so the paths that fill it are covered end to end here: a normal pull,
 * a tablet whose local menu was wiped while its sync cursor said "up to date", a dish that is later marked
 * sold out or deleted, and the rule that the Captain never sends menu changes back.
 */
const NOW = '2026-09-28T10:00:00.000Z';
// What the cloud reports as its clock at the first pull: after the menu was published (08:53), before the later edits below.
const SERVER_TIME = '2026-09-28T09:00:00.000Z';
const dish = (id: string, name: string, price: number, extra: Record<string, unknown> = {}) => ({
  id, categoryId: 'cat-1', sku: id.toUpperCase(), name, description: '', price, dietaryType: 'VEG', spiceLevel: 'MILD',
  isPopular: false, isNew: false, isFeatured: false, isAvailable: true, prepTimeMinutes: 10, allergens: [], modifierGroupIds: [], sortOrder: 1,
  updatedAt: '2026-09-28T08:53:00.000Z', ...extra
});

let cloud: Record<string, CloudSyncedEntity[]>;
let pushes: { type: string; events: EntitySyncEvent[] }[];
let pulls: { type: string; since?: string }[];

const entity = (payload: Record<string, unknown>): CloudSyncedEntity => ({ externalId: String(payload.id), payload, updatedAt: String(payload.updatedAt) });

const store = new Map<string, string>();
const g = globalThis as unknown as { localStorage: unknown };
let savedStorage: unknown;

beforeEach(() => {
  savedStorage = g.localStorage;
  store.clear();
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  KeyValueStore.reset();
  MenuRepository.startFreshMenu();
  db.users = [];
  cloud = {
    MENU_CATEGORY: [entity({ id: 'cat-1', name: 'Mains', slug: 'mains', sortOrder: 1, isActive: true, updatedAt: '2026-09-28T08:53:00.000Z' })],
    MENU_ITEM: [entity(dish('d-1', 'Paneer Tikka', 220)), entity(dish('d-2', 'Dal Tadka', 180))]
  };
  pushes = [];
  pulls = [];
  EntitySyncEngine.configureTransport({
    push: async (type, events) => {
      pushes.push({ type, events });
      return { results: events.map((e) => ({ externalId: e.externalId, status: 'ok' as const })), serverTime: SERVER_TIME };
    },
    pull: async (type, since) => {
      pulls.push({ type, since });
      const after = since ? Date.parse(since) : 0;
      return { entities: (cloud[type] ?? []).filter((e) => Date.parse(e.updatedAt) > after), serverTime: SERVER_TIME };
    }
  });
  useCaptainStore.getState().logout();
  useCaptainStore.setState({ cartItems: [], selectedTable: null, selectedTableOrder: null });
});

afterEach(() => {
  g.localStorage = savedStorage;
  EntitySyncEngine.configureTransport(null);
});

describe('Captain menu arrives from the cloud', () => {
  it('a tablet whose local menu was wiped but whose cursors say "up to date" still gets the whole menu', async () => {
    // The state a re-activated tablet used to be left in: nothing local, cursors already at "now".
    KeyValueStore.set('jamanvaar_entity_sync_cursor_MENU_ITEM', NOW);
    KeyValueStore.set('jamanvaar_entity_sync_cursor_MENU_CATEGORY', NOW);
    expect(db.menuItems).toHaveLength(0);

    await syncMenuCatalog({ push: false });
    useCaptainStore.getState().refreshState();

    expect(db.menuItems.map((m) => m.name).sort()).toEqual(['Dal Tadka', 'Paneer Tikka']);
    expect(useCaptainStore.getState().menuItems).toHaveLength(2);
    expect(useCaptainStore.getState().categories.map((c) => c.name)).toEqual(['Mains']);
  });

  it('a Captain never sends menu changes back to the cloud', async () => {
    await syncMenuCatalog({ push: false });
    db.menuItems[0].name = 'Edited on the tablet';
    await syncMenuCatalog({ push: false });
    expect(pushes).toEqual([]);
  });

  it('a dish marked sold out in the cloud reaches the Captain and cannot be added to a cart', async () => {
    await syncMenuCatalog({ push: false });
    cloud.MENU_ITEM = [entity(dish('d-1', 'Paneer Tikka', 220, { isAvailable: false, updatedAt: '2026-09-28T09:30:00.000Z' }))];
    await syncMenuCatalog({ push: false });

    const soldOut = db.menuItems.find((m) => m.id === 'd-1')!;
    expect(soldOut.isAvailable).toBe(false);
    useCaptainStore.getState().addItemToCart(soldOut, [], '', 'COURSE_1', 1);
    expect(useCaptainStore.getState().cartItems).toHaveLength(0);

    const available = db.menuItems.find((m) => m.id === 'd-2')!;
    useCaptainStore.getState().addItemToCart(available, [], '', 'COURSE_1', 1);
    expect(useCaptainStore.getState().cartItems).toHaveLength(1);
  });

  it('a price change published later replaces the old price', async () => {
    await syncMenuCatalog({ push: false });
    cloud.MENU_ITEM = [entity(dish('d-2', 'Dal Tadka', 200, { updatedAt: '2026-09-28T09:45:00.000Z' }))];
    await syncMenuCatalog({ push: false });
    expect(db.menuItems.find((m) => m.id === 'd-2')!.price).toBe(200);
  });

  it('a dish deleted in Restaurant Admin disappears from the Captain', async () => {
    await syncMenuCatalog({ push: false });
    expect(db.menuItems).toHaveLength(2);
    cloud.MENU_ITEM = [{ externalId: 'd-1', payload: { id: 'd-1', deleted: true, updatedAt: '2026-09-28T09:50:00.000Z' }, updatedAt: '2026-09-28T09:50:00.000Z' }];
    await syncMenuCatalog({ push: false });
    expect(db.menuItems.map((m) => m.id)).toEqual(['d-2']);
  });

  it('an ordinary tick only asks for what changed since the last one', async () => {
    await syncMenuCatalog({ push: false });
    pulls.length = 0;
    await syncMenuCatalog({ push: false });
    const item = pulls.find((p) => p.type === 'MENU_ITEM')!;
    expect(item.since).toBe(SERVER_TIME);
  });
});

describe('Captain sign-in needs the staff record from the cloud', () => {
  it('a PIN hash pulled from the cloud signs the person in; a person who was never synced cannot', async () => {
    const created = await StaffRepository.createUser({ username: 'sunil', fullName: 'Sunil Captain', roleId: 'role-captain' });
    const payload = StaffRepository.toSyncPayload(db.users.find((u) => u.id === created.id)!);
    db.users = [];
    expect(await useCaptainStore.getState().login(created.issuedPin!)).toBe(false);

    StaffRepository.applyRemoteUser(payload);
    expect(await useCaptainStore.getState().login(created.issuedPin!)).toBe(true);
    expect(useCaptainStore.getState().currentCaptain?.name).toBe('Sunil Captain');
  });
});
