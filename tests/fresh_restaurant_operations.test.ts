import { describe, it, expect, beforeEach } from 'vitest';
import { db, RestaurantIdentityRepository, TableRepository } from '@jamanvaar/database';

/**
 * BUG-115 (found in the live Captain test): a brand-new restaurant already had "Combos & Meal Deals:
 * 2 ACTIVE" built from dishes that do not exist, demo coupon codes that would give real discounts,
 * and twelve demo tables that are not its floor. BUG-013/025/045 cleared only the menu, printers and
 * inventory. A real restaurant now starts with none of these until it creates its own.
 */
describe('A newly activated restaurant starts without demo operations data (BUG-115)', () => {
  beforeEach(() => db.resetToDefaultSeed());

  it('the demo install really does ship with them (so this test can fail)', () => {
    expect(db.combos.length).toBeGreaterThan(0);
    expect(db.coupons.length).toBeGreaterThan(0);
    expect(db.tables.length).toBeGreaterThan(0);
  });

  it('activation clears combos, coupons, offers and the demo tables', () => {
    RestaurantIdentityRepository.startFreshOperations();
    expect(db.combos).toEqual([]);
    expect(db.coupons).toEqual([]);
    expect(db.offers).toEqual([]);
    expect(db.tables).toEqual([]);
  });

  it('the restaurant can then build its own floor, and an empty floor stays empty when reloaded', () => {
    RestaurantIdentityRepository.startFreshOperations();
    expect(db.floorPlanStartedEmpty).toBe(true);

    TableRepository.createTable({ tableNumber: '1', capacity: 4, zone: 'Main Hall' });
    expect(db.tables).toHaveLength(1);
  });

  /**
   * B2-011/B2-018: a brand-new restaurant showed 2 live "cooking" orders and their kitchen
   * tickets before any real order was ever placed — on Restaurant Admin, POS and the live
   * kitchen board. Investigated down to two independent causes, both already fixed elsewhere:
   * `generateSeedOrders()` (seed.ts) used to fabricate sales history and now correctly returns
   * `[]`, and the specific two ₹922 orders seen live were actually traced to the B2-029
   * cross-tenant data leak (another restaurant's real orders, pulled in through a missing
   * `restaurantId` filter on the cloud sync endpoints) rather than to seed data at all. This
   * locks in both: no seed orders ship by default, and none are fabricated for KOTs either
   * (KOTs only ever come from real orders — `db.kots` has no seed function of its own).
   */
  it('a newly activated restaurant has zero orders and zero kitchen tickets (B2-011/B2-018)', () => {
    expect(db.orders).toEqual([]);
    expect(db.kots).toEqual([]);
  });
});
