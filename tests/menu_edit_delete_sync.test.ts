import { describe, it, expect, beforeEach } from 'vitest';
import { CollectionSync, type CollectionSyncRecord } from '@jamanvaar/database';
import { EntitySyncEngine, syncCollection } from '@jamanvaar/sync';

/**
 * BUG-149: edits and deletions made on one device never reached the others, and a deleted dish came back
 * within seconds, because every device uploaded its whole (possibly stale) list before downloading anything.
 * Two "devices" here share a fake cloud that behaves like the real one: the newest change wins.
 */
type Dish = { id: string; name: string; price: number; updatedAt?: string };

const changedAt = (p: Record<string, unknown>) => {
  const ms = typeof p.updatedAt === 'string' ? Date.parse(p.updatedAt) : NaN;
  return Number.isNaN(ms) ? 0 : ms;
};

function makeCloud() {
  const rows = new Map<string, { externalId: string; payload: Record<string, unknown>; updatedAt: string }>();
  let clock = 1_000;
  return {
    rows,
    transport: {
      push: async (_type: string, events: CollectionSyncRecord[]) => {
        const results = events.map((e) => {
          const existing = rows.get(e.externalId);
          if (!existing || changedAt(e.payload) >= changedAt(existing.payload)) {
            rows.set(e.externalId, { externalId: e.externalId, payload: e.payload, updatedAt: new Date(Date.UTC(2030, 0, 1) + clock++).toISOString() });
          }
          return { externalId: e.externalId, status: 'ok' as const };
        });
        return { results, serverTime: new Date().toISOString() };
      },
      pull: async (_type: string, since?: string) => {
        const after = since ? Date.parse(since) : 0;
        return { entities: [...rows.values()].filter((r) => Date.parse(r.updatedAt) > after), serverTime: new Date(Date.UTC(2030, 0, 1) + clock).toISOString() };
      }
    }
  };
}

describe('menu edits and deletions reach the other devices (BUG-149)', () => {
  let cloud: ReturnType<typeof makeCloud>;
  let posDishes: Dish[];
  let adminDishes: Dish[];
  let posSync: CollectionSync<Dish>;
  let adminSync: CollectionSync<Dish>;

  const accepts = (r: Record<string, unknown>) => typeof r.name === 'string';
  const tick = async (which: 'pos' | 'admin') => {
    await syncCollection('MENU_ITEM', which === 'pos' ? posSync : adminSync, true);
  };

  beforeEach(async () => {
    cloud = makeCloud();
    EntitySyncEngine.configureTransport(cloud.transport);
    posDishes = [{ id: 'd1', name: 'Hara Bhara Kebab', price: 220 }, { id: 'd2', name: 'Veg Seekh', price: 250 }];
    adminDishes = [{ id: 'd1', name: 'Hara Bhara Kebab', price: 220 }, { id: 'd2', name: 'Veg Seekh', price: 250 }];
    posSync = new CollectionSync<Dish>('t_pos', () => posDishes, accepts);
    adminSync = new CollectionSync<Dish>('t_admin', () => adminDishes, accepts);
    posSync.reset();
    adminSync.reset();
    // Both devices start in step with the cloud.
    await tick('admin');
    await tick('pos');
  });

  it('a price changed on one device reaches the other, and is not overwritten by the stale copy', async () => {
    adminDishes[0].price = 230;
    await tick('admin');

    await tick('pos'); // the counter still holds 220 locally, but has not edited it
    expect(posDishes.find((d) => d.id === 'd1')!.price).toBe(230);
    expect(cloud.rows.get('d1')!.payload.price).toBe(230);

    await tick('pos');
    await tick('admin');
    expect(adminDishes.find((d) => d.id === 'd1')!.price).toBe(230);
    expect(cloud.rows.get('d1')!.payload.price).toBe(230);
  });

  it('a deleted dish stays deleted on every device', async () => {
    adminDishes.splice(1, 1);
    adminSync.recordDeletion('d2');
    await tick('admin');

    await tick('pos'); // still holds d2; must receive the deletion, not re-upload it
    expect(posDishes.map((d) => d.id)).toEqual(['d1']);

    await tick('admin');
    await tick('pos');
    expect(adminDishes.map((d) => d.id)).toEqual(['d1']);
    expect(posDishes.map((d) => d.id)).toEqual(['d1']);
    expect(cloud.rows.get('d2')!.payload.deleted).toBe(true);
  });

  it('a device that never edited a dish does not re-upload it on every tick', async () => {
    const before = cloud.rows.get('d1')!.updatedAt;
    await tick('pos');
    await tick('admin');
    await tick('pos');
    expect(cloud.rows.get('d1')!.updatedAt).toBe(before);
  });

  it('a genuinely newer local edit is kept when an older change arrives, and then pushed', async () => {
    adminDishes[0].name = 'Hara Bhara Kebab (6 Pcs)';
    await tick('admin');
    // The counter edits the same dish a moment later.
    await new Promise((r) => setTimeout(r, 5));
    posDishes[0].price = 240;
    await tick('pos');
    const dish = posDishes.find((d) => d.id === 'd1')!;
    expect(dish.price).toBe(240);
    expect(cloud.rows.get('d1')!.payload.price).toBe(240);
  });

  it('a new dish added on one device appears on the other', async () => {
    adminDishes.push({ id: 'd3', name: 'Paneer Tikka', price: 280 });
    await tick('admin');
    await tick('pos');
    expect(posDishes.map((d) => d.id)).toContain('d3');
  });

  // BUG-159: a guest registered at the counter never reached Restaurant Admin's CRM.
  it('a guest is identified by phone number and travels both ways', async () => {
    type Guest = { phone: string; name: string; loyaltyPoints: number; updatedAt?: string };
    let posGuests: Guest[] = [{ phone: '9876500011', name: 'Meera Guest', loyaltyPoints: 10 }];
    let adminGuests: Guest[] = [];
    const posG = new CollectionSync<Guest>('t_pos_g', () => posGuests, (r) => typeof r.phone === 'string', 'phone');
    const adminG = new CollectionSync<Guest>('t_admin_g', () => adminGuests, (r) => typeof r.phone === 'string', 'phone');
    posG.reset();
    adminG.reset();
    await syncCollection('CUSTOMER', posG, true);
    await syncCollection('CUSTOMER', adminG, true);
    expect(adminGuests.map((g) => g.phone)).toEqual(['9876500011']);

    // The counter gives her points; the owner's CRM sees them.
    posGuests[0].loyaltyPoints = 25;
    await syncCollection('CUSTOMER', posG, true);
    await syncCollection('CUSTOMER', adminG, true);
    expect(adminGuests[0].loyaltyPoints).toBe(25);

    // The owner deletes her; the counter does not bring her back.
    adminGuests = [];
    adminG.recordDeletion('9876500011');
    await syncCollection('CUSTOMER', adminG, true);
    await syncCollection('CUSTOMER', posG, true);
    expect(posGuests).toEqual([]);
    expect(cloud.rows.get('9876500011')!.payload.deleted).toBe(true);
  });
});
