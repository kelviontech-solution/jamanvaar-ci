import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { hashOpaqueToken } from '../src/common/security/token.util';

/**
 * The generic sync bridge extension (Phase 5 of the remediation sequence) —
 * one flexible table/endpoint pair reused across CRM/Inventory/Payments-
 * reporting instead of a bespoke SyncedOrder-style model per domain.
 */
describe('Generic entity sync bridge (CRM/Inventory/Payments)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-entity-sync-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  let posToken: string;
  let posAdminToken: string;

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await platformLogin(app, adminEmail, adminPassword);
    platformToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Entity Sync Restaurant ${Date.now()}`,
      ownerName: 'Entity Sync Owner',
      ownerEmail: `entity-sync-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;

    const planRes = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO', name: `TEST Entity Sync Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { posTerminal: true }
    });
    planId = planRes.body.id;
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      // Phase 5 split Kiosk into its own commercial family — PRO's defaults no longer include
      // it, and this suite's KIOSK/CAPTAIN describe blocks below redeem those device types.
      applications: ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN']
    });

    const keyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const redeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: keyRes.body.code, deviceType: 'POS' });
    posToken = redeemRes.body.deviceToken;
    const adminKey = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'POS_ADMIN', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const adminRedeem = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: adminKey.body.code, deviceType: 'POS_ADMIN' });
    posAdminToken = adminRedeem.body.deviceToken;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('rejects an unknown entity type', async () => {
    const res = await authed('post', '/api/v1/entity-sync/NOT_A_REAL_TYPE', posToken).send({
      events: [{ externalId: '9999999999', payload: { name: 'Test' } }]
    });
    expect(res.status).toBe(400);
  });

  it('pushes and pulls a CUSTOMER record end to end', async () => {
    const pushRes = await authed('post', '/api/v1/entity-sync/CUSTOMER', posToken).send({
      events: [{ externalId: '9876543210', payload: { name: 'Priya Sharma', loyaltyPoints: 120, tags: ['VIP'] } }]
    });
    expect(pushRes.status).toBe(201);
    expect(pushRes.body.results).toEqual([{ externalId: '9876543210', status: 'ok', syncVersion: 1 }]);

    const pullRes = await authed('get', '/api/v1/entity-sync/CUSTOMER', posToken);
    expect(pullRes.body.entities).toHaveLength(1);
    expect(pullRes.body.entities[0]).toMatchObject({
      externalId: '9876543210',
      payload: { name: 'Priya Sharma', loyaltyPoints: 120, tags: ['VIP'] }
    });
  });

  it('re-pushing the same externalId within one entityType updates in place, not a new row', async () => {
    await authed('post', '/api/v1/entity-sync/CUSTOMER', posToken).send({
      events: [{ externalId: '9876543210', payload: { name: 'Priya Sharma', loyaltyPoints: 150, tags: ['VIP', 'REGULAR'] } }]
    });

    const rows = await prisma.runAsTenant(restaurantId, (tx) => tx.syncedEntity.findMany({ where: { entityType: 'CUSTOMER', externalId: '9876543210' } }));
    expect(rows).toHaveLength(1);
    expect(rows[0].syncVersion).toBe(2);
    expect((rows[0].payload as any).loyaltyPoints).toBe(150);
  });

  it('keeps CUSTOMER and INVENTORY_ITEM rows fully separate even with the same externalId', async () => {
    await authed('post', '/api/v1/entity-sync/INVENTORY_ITEM', posAdminToken).send({
      events: [{ externalId: '9876543210', payload: { name: 'Basmati Rice', currentStock: 40, unit: 'kg' } }]
    });

    const customerPull = await authed('get', '/api/v1/entity-sync/CUSTOMER', posToken);
    const inventoryPull = await authed('get', '/api/v1/entity-sync/INVENTORY_ITEM', posToken);
    expect(customerPull.body.entities).toHaveLength(1);
    expect(inventoryPull.body.entities).toHaveLength(1);
    expect(customerPull.body.entities[0].payload.name).toBe('Priya Sharma');
    expect(inventoryPull.body.entities[0].payload.name).toBe('Basmati Rice');
  });

  it('pushes and pulls a MENU_ITEM — the database-layer extension that gives a restaurant\'s menu real cloud persistence instead of living only in one device\'s browser storage', async () => {
    const pushRes = await authed('post', '/api/v1/entity-sync/MENU_ITEM', posToken).send({
      events: [{ externalId: 'item-butter-naan', payload: { name: 'Butter Naan', price: 60, categoryId: 'cat-breads', isAvailable: true } }]
    });
    expect(pushRes.status).toBe(201);

    const pullRes = await authed('get', '/api/v1/entity-sync/MENU_ITEM', posToken);
    expect(pullRes.body.entities).toHaveLength(1);
    expect(pullRes.body.entities[0]).toMatchObject({ externalId: 'item-butter-naan', payload: { name: 'Butter Naan', price: 60 } });
  });

  /**
   * BUG-019/034/035 (discovered live, verified against a real running stack): Restaurant Admin issues a
   * PIN telling the owner "this logs them into POS, Captain, KDS and Kiosk" — but staff records were
   * never in the entity-sync bridge at all (only CUSTOMER/MENU_ITEM/MENU_CATEGORY/INVENTORY_ITEM/
   * PAYMENT_TRANSACTION were), so a PIN created on one device genuinely did not work on any other real
   * device of the same restaurant. STAFF_USER closes that gap the same way MENU_ITEM did for the menu.
   */
  it('pushes a STAFF_USER (with its PIN hash, never a plaintext PIN) and pulls it on a DIFFERENT device of the same restaurant', async () => {
    const kdsKeyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'KDS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const kdsRedeem = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: kdsKeyRes.body.code, deviceType: 'KDS' });
    const kdsToken = kdsRedeem.body.deviceToken as string;

    const pushRes = await authed('post', '/api/v1/entity-sync/STAFF_USER', posToken).send({
      events: [{ externalId: 'usr-chef-1', payload: { id: 'usr-chef-1', username: 'amitdave', fullName: 'Amit Dave', roleId: 'role-chef', isActive: true, pinHash: 'pinv1:deadbeefcafef00d' } }]
    });
    expect(pushRes.status).toBe(201);
    expect(JSON.stringify(pushRes.body)).not.toMatch(/"pin":|"plainPin"/);

    // A different device, activated separately, sees it — this is the actual cross-app promise.
    const pullFromKds = await authed('get', '/api/v1/entity-sync/STAFF_USER', kdsToken);
    expect(pullFromKds.body.entities).toHaveLength(1);
    expect(pullFromKds.body.entities[0]).toMatchObject({
      externalId: 'usr-chef-1',
      payload: { fullName: 'Amit Dave', roleId: 'role-chef', pinHash: 'pinv1:deadbeefcafef00d' }
    });
  });

  /**
   * security-audit CRIT-01 regression: a device type with no staff-management console
   * (Kiosk, KDS, Captain, Kiosk Admin) must not be able to write — or overwrite — a
   * STAFF_USER record. Before the fix, this succeeded and let a public kiosk mint a
   * fleet-wide manager PIN. Reading STAFF_USER stays open to every device type (that's
   * how offline PIN verification works on those terminals), so this only checks the
   * write side.
   */
  it('rejects a STAFF_USER push from a device type with no staff-management console (Kiosk, KDS, Captain, Kiosk Admin)', async () => {
    const deniedTypes: Array<'KIOSK' | 'KDS' | 'CAPTAIN' | 'KIOSK_ADMIN'> = ['KIOSK', 'KDS', 'CAPTAIN', 'KIOSK_ADMIN'];
    for (const deviceType of deniedTypes) {
      const key = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: deviceType, expiresAt: new Date(Date.now() + 86400000).toISOString() });
      const redeem = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType });
      const token = redeem.body.deviceToken as string;

      const res = await authed('post', '/api/v1/entity-sync/STAFF_USER', token).send({
        events: [{ externalId: `usr-forged-${deviceType}`, payload: { id: `usr-forged-${deviceType}`, roleId: 'role-manager', isActive: true, pinHash: 'pinv1:deadbeefcafef00d' } }]
      });
      expect(res.status, `${deviceType} should be denied, got ${res.status}: ${JSON.stringify(res.body)}`).toBe(403);
    }

    // Confirm nothing was written despite the 403s.
    const stillNothing = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.syncedEntity.findMany({ where: { entityType: 'STAFF_USER', externalId: { startsWith: 'usr-forged-' } } })
    );
    expect(stillNothing).toHaveLength(0);
  });

  it('a POS_ADMIN device may still write STAFF_USER (the console this data actually comes from)', async () => {
    const key = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'POS_ADMIN', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const redeem = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: 'POS_ADMIN' });
    const posAdminToken = redeem.body.deviceToken as string;

    const res = await authed('post', '/api/v1/entity-sync/STAFF_USER', posAdminToken).send({
      events: [{ externalId: 'usr-legit-admin', payload: { id: 'usr-legit-admin', roleId: 'role-manager', isActive: true, pinHash: 'pinv1:cafef00ddeadbeef' } }]
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  });

  it('a STAFF_USER pushed for one restaurant is invisible to a device on another restaurant', async () => {
    const otherRestaurant = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Entity Sync Other ${Date.now()}`,
      ownerName: 'Other Owner',
      ownerEmail: `entity-sync-other-owner-${Date.now()}@test.example.com`
    });
    const otherRestaurantId = otherRestaurant.body.restaurant.id;
    const otherPlan = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO', name: `TEST Entity Sync Other Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { posTerminal: true }
    });
    await authed('post', '/api/v1/subscriptions', platformToken).send({ restaurantId: otherRestaurantId, planId: otherPlan.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
    const otherKey = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId: otherRestaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const otherRedeem = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: otherKey.body.code, deviceType: 'POS' });

    const pullRes = await authed('get', '/api/v1/entity-sync/STAFF_USER', otherRedeem.body.deviceToken);
    expect(pullRes.body.entities).toEqual([]);

    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: otherRestaurantId } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: otherPlan.body.id } }));
  });

  /**
   * BUG-096/097 (found in the live Captain test): the table layout made in Restaurant Admin never
   * reached Captain or POS, and a table seated on Captain looked vacant on POS. DINING_TABLE syncs
   * the floor plan and each table's state. Unlike the other entity types, two devices routinely edit
   * the same record (Captain seats it, POS settles it), so the newer change must win — a device
   * pushing a stale copy must not undo a later change.
   */
  describe('DINING_TABLE', () => {
    let captainToken: string;
    const table = (over: Record<string, unknown>) => ({
      externalId: 'tbl-t1',
      payload: { id: 'tbl-t1', tableNumber: '1', capacity: 4, zone: 'Main Hall', floor: 1, isActive: true, status: 'AVAILABLE', updatedAt: '2026-09-20T10:00:00.000Z', ...over }
    });

    beforeAll(async () => {
      const key = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'CAPTAIN', expiresAt: new Date(Date.now() + 86400000).toISOString() });
      const redeem = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: 'CAPTAIN' });
      captainToken = redeem.body.deviceToken as string;
    });

    it('a table pushed by one device is pulled by another device of the same restaurant', async () => {
      const push = await authed('post', '/api/v1/entity-sync/DINING_TABLE', posToken).send({ events: [table({ status: 'OCCUPIED', currentOrderId: 'ord-1', updatedAt: '2026-09-20T10:05:00.000Z' })] });
      expect(push.status).toBe(201);

      const pull = await authed('get', '/api/v1/entity-sync/DINING_TABLE', captainToken);
      expect(pull.body.entities).toHaveLength(1);
      expect(pull.body.entities[0].payload).toMatchObject({ tableNumber: '1', status: 'OCCUPIED', currentOrderId: 'ord-1' });
    });

    it('an older copy pushed later does not undo a newer change; a newer one does replace it', async () => {
      await authed('post', '/api/v1/entity-sync/DINING_TABLE', posToken).send({ events: [table({ status: 'BILL_REQUESTED', updatedAt: '2026-09-20T10:30:00.000Z' })] });

      // A device that was offline pushes what it last knew, which is older.
      const stale = await authed('post', '/api/v1/entity-sync/DINING_TABLE', captainToken).send({ events: [table({ status: 'OCCUPIED', updatedAt: '2026-09-20T10:10:00.000Z' })] });
      expect(stale.status).toBe(201);
      expect(stale.body.results[0].status).toBe('ok');

      let pull = await authed('get', '/api/v1/entity-sync/DINING_TABLE', posToken);
      expect(pull.body.entities[0].payload).toMatchObject({ status: 'BILL_REQUESTED', updatedAt: '2026-09-20T10:30:00.000Z' });

      await authed('post', '/api/v1/entity-sync/DINING_TABLE', captainToken).send({ events: [table({ status: 'AVAILABLE', updatedAt: '2026-09-20T11:00:00.000Z' })] });
      pull = await authed('get', '/api/v1/entity-sync/DINING_TABLE', posToken);
      expect(pull.body.entities[0].payload).toMatchObject({ status: 'AVAILABLE' });
    });

    it('a staff message or bill request pushed by Captain is pulled by other devices (BUG-099/100)', async () => {
      const msg = { id: 'svc-1', kind: 'BILL_REQUEST', recipient: 'POS', senderName: 'Ravi Waiter', presetText: 'Bill requested', tableNumber: '4', createdAt: new Date().toISOString() };
      const push = await authed('post', '/api/v1/entity-sync/SERVICE_MESSAGE', captainToken).send({ events: [{ externalId: 'svc-1', payload: msg }] });
      expect(push.status).toBe(201);

      const pull = await authed('get', '/api/v1/entity-sync/SERVICE_MESSAGE', posToken);
      expect(pull.body.entities).toHaveLength(1);
      expect(pull.body.entities[0].payload).toMatchObject({ kind: 'BILL_REQUEST', tableNumber: '4' });
    });

    it('a deleted table is stored as a tombstone that other devices can pull', async () => {
      await authed('post', '/api/v1/entity-sync/DINING_TABLE', posToken).send({ events: [{ externalId: 'tbl-t1', payload: { id: 'tbl-t1', deleted: true, updatedAt: '2026-09-20T12:00:00.000Z' } }] });
      const pull = await authed('get', '/api/v1/entity-sync/DINING_TABLE', captainToken);
      expect(pull.body.entities[0].payload).toMatchObject({ deleted: true });
    });
  });

  /**
   * BUG-149/130/133/136: a menu edit or deletion on one device never reached the others, because every
   * device re-uploaded its whole (stale) list, and Kiosk Admin's combos, coupons and the guests' ratings had
   * no sync path at all. The menu and promotions now follow "the newest change wins".
   */
  describe('MENU_ITEM / COMBO / COUPON / CUSTOMER_FEEDBACK (BUG-149/130/133/136)', () => {
    let kioskToken: string;
    const dish = (over: Record<string, unknown>) => ({
      externalId: 'dish-1',
      payload: { id: 'dish-1', name: 'Hara Bhara Kebab', price: 220, updatedAt: '2026-09-20T10:00:00.000Z', ...over }
    });

    beforeAll(async () => {
      const key = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'KIOSK_ADMIN', expiresAt: new Date(Date.now() + 86400000).toISOString() });
      const redeem = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: 'KIOSK_ADMIN' });
      kioskToken = redeem.body.deviceToken as string;
    });

    it('a stale copy of a dish does not undo a newer edit, and a newer edit replaces it', async () => {
      await authed('post', '/api/v1/entity-sync/MENU_ITEM', posToken).send({ events: [dish({ price: 230, updatedAt: '2026-09-20T10:30:00.000Z' })] });
      // A device that never heard about the edit uploads its old copy.
      await authed('post', '/api/v1/entity-sync/MENU_ITEM', kioskToken).send({ events: [dish({ price: 220, updatedAt: '2026-09-20T10:00:00.000Z' })] });

      let pull = await authed('get', '/api/v1/entity-sync/MENU_ITEM', posToken);
      const row = pull.body.entities.find((e: { externalId: string }) => e.externalId === 'dish-1');
      expect(row.payload).toMatchObject({ price: 230 });

      await authed('post', '/api/v1/entity-sync/MENU_ITEM', kioskToken).send({ events: [dish({ price: 240, updatedAt: '2026-09-20T11:00:00.000Z' })] });
      pull = await authed('get', '/api/v1/entity-sync/MENU_ITEM', posToken);
      expect(pull.body.entities.find((e: { externalId: string }) => e.externalId === 'dish-1').payload).toMatchObject({ price: 240 });
    });

    it('a deleted dish stays deleted: an older re-upload of it is ignored', async () => {
      await authed('post', '/api/v1/entity-sync/MENU_ITEM', posToken).send({ events: [{ externalId: 'dish-2', payload: { id: 'dish-2', deleted: true, updatedAt: '2026-09-20T12:00:00.000Z' } }] });
      await authed('post', '/api/v1/entity-sync/MENU_ITEM', kioskToken).send({ events: [dish({ externalId: 'dish-2' } as never)].map((e) => ({ externalId: 'dish-2', payload: { ...e.payload, id: 'dish-2', updatedAt: '2026-09-20T09:00:00.000Z' } })) });

      const pull = await authed('get', '/api/v1/entity-sync/MENU_ITEM', kioskToken);
      expect(pull.body.entities.find((e: { externalId: string }) => e.externalId === 'dish-2').payload).toMatchObject({ deleted: true });
    });

    /**
     * B2-038: found live (BUG-149's own delete half only partly worked) - a deleted dish flip-flopped
     * back onto every device for ~50s before finally staying gone. The prior guard here only rejected
     * a re-upload OLDER than the tombstone (covered above); it did nothing to stop one carrying a
     * timestamp EQUAL TO OR NEWER than the tombstone's own - which a device that simply hadn't pulled
     * the deletion yet could and did produce, since its own sync-tick clock keeps advancing while it
     * remains unaware anything was deleted. That push would win the plain timestamp comparison and
     * overwrite the tombstone in the DB, which then fanned the "revived" dish back out to every other
     * device on their next pull - exactly the observed flip-flop. A tombstone must be sticky regardless
     * of the incoming timestamp; only another deletion can touch a deleted record from here on.
     */
    it('a deleted dish stays deleted even against a re-upload timestamped the same as or after the tombstone (B2-038)', async () => {
      await authed('post', '/api/v1/entity-sync/MENU_ITEM', posToken).send({ events: [{ externalId: 'dish-3', payload: { id: 'dish-3', deleted: true, updatedAt: '2026-09-20T12:00:00.000Z' } }] });

      // A device that has not yet learned of the deletion re-pushes its still-live copy, timestamped
      // AFTER the tombstone - exactly what a device's own later sync tick produces once it re-stamps
      // an unrelated local change on a record it doesn't know is already gone elsewhere.
      const laterPush = await authed('post', '/api/v1/entity-sync/MENU_ITEM', kioskToken).send({
        events: [dish({} as never)].map((e) => ({ externalId: 'dish-3', payload: { ...e.payload, id: 'dish-3', updatedAt: '2026-09-20T12:00:01.000Z' } }))
      });
      expect(laterPush.status).toBe(201);
      expect(laterPush.body.results[0].status).toBe('ok'); // accepted-and-ignored, not an error - the pusher should not retry forever

      const pull = await authed('get', '/api/v1/entity-sync/MENU_ITEM', posToken);
      expect(pull.body.entities.find((e: { externalId: string }) => e.externalId === 'dish-3').payload).toMatchObject({ deleted: true });

      // Only another deletion event is ever accepted for an already-tombstoned externalId.
      const reDelete = await authed('post', '/api/v1/entity-sync/MENU_ITEM', kioskToken).send({
        events: [{ externalId: 'dish-3', payload: { id: 'dish-3', deleted: true, updatedAt: '2026-09-20T13:00:00.000Z' } }]
      });
      expect(reDelete.status).toBe(201);
      const pullAfterRedelete = await authed('get', '/api/v1/entity-sync/MENU_ITEM', posToken);
      expect(pullAfterRedelete.body.entities.find((e: { externalId: string }) => e.externalId === 'dish-3').payload).toMatchObject({ deleted: true });
    });

    it('combos, coupons and guest ratings travel between devices of the same restaurant', async () => {
      await authed('post', '/api/v1/entity-sync/COMBO', posAdminToken).send({ events: [{ externalId: 'combo-1', payload: { id: 'combo-1', name: 'Thali Combo', updatedAt: '2026-09-20T10:00:00.000Z' } }] });
      await authed('post', '/api/v1/entity-sync/COUPON', posAdminToken).send({ events: [{ externalId: 'cpn-1', payload: { id: 'cpn-1', code: 'WELCOME50', usageCount: 0, updatedAt: '2026-09-20T10:00:00.000Z' } }] });
      await authed('post', '/api/v1/entity-sync/CUSTOMER_FEEDBACK', kioskToken).send({ events: [{ externalId: 'fb-1', payload: { id: 'fb-1', rating: 5, kioskId: 'K1', createdAt: '2026-09-20T10:00:00.000Z' } }] });

      expect((await authed('get', '/api/v1/entity-sync/COMBO', kioskToken)).body.entities[0].payload).toMatchObject({ name: 'Thali Combo' });
      expect((await authed('get', '/api/v1/entity-sync/COUPON', kioskToken)).body.entities[0].payload).toMatchObject({ code: 'WELCOME50' });
      expect((await authed('get', '/api/v1/entity-sync/CUSTOMER_FEEDBACK', posToken)).body.entities[0].payload).toMatchObject({ rating: 5 });

      // A redemption counted on the kiosk (newer) wins over the older copy, and an older copy cannot undo it.
      await authed('post', '/api/v1/entity-sync/COUPON', kioskToken).send({ events: [{ externalId: 'cpn-1', payload: { id: 'cpn-1', code: 'WELCOME50', usageCount: 3, updatedAt: '2026-09-20T11:00:00.000Z' } }] });
      await authed('post', '/api/v1/entity-sync/COUPON', posAdminToken).send({ events: [{ externalId: 'cpn-1', payload: { id: 'cpn-1', code: 'WELCOME50', usageCount: 0, updatedAt: '2026-09-20T10:00:00.000Z' } }] });
      expect((await authed('get', '/api/v1/entity-sync/COUPON', posToken)).body.entities[0].payload).toMatchObject({ usageCount: 3 });
    });

    it('a device lists the kiosks of its own restaurant in the fleet list, with their health (BUG-132)', async () => {
      const res = await authed('get', '/api/v1/devices/me/kiosks', posToken);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.kiosks.length).toBeGreaterThanOrEqual(1);
      expect(res.body.kiosks[0]).toHaveProperty('health');
      expect(res.body.kiosks.every((k: { id: string }) => typeof k.id === 'string')).toBe(true);
    });
  });
  it('syncs inventory masters with console authority, branch isolation and deletion recovery', async () => {
    const admin = await prisma.runAsTenant(restaurantId, tx => tx.device.findUniqueOrThrow({ where: { deviceTokenHash: hashOpaqueToken(posAdminToken) } }));
    const pos = await prisma.runAsTenant(restaurantId, tx => tx.device.findUniqueOrThrow({ where: { deviceTokenHash: hashOpaqueToken(posToken) } }));
    const branches = await prisma.runAsTenant(restaurantId, tx => Promise.all(['Master A', 'Master B'].map(name => tx.branch.create({ data: { restaurantId, name, code: name.replaceAll(' ', '_') } }))));
    try {
      await prisma.runAsTenant(restaurantId, tx => Promise.all([
        tx.device.update({ where: { id: admin.id }, data: { branchId: branches[0].id } }),
        tx.device.update({ where: { id: pos.id }, data: { branchId: branches[1].id } })
      ]));
      for (const type of ['INVENTORY_ITEM', 'RECIPE', 'SUPPLIER']) {
        const id = `master-fix-${type}`;
        const event = { externalId: id, payload: { id, name: 'Master fixture', menuItemId: 'dish', ingredients: [], unit: 'kg', openingStock: 10, currentStock: 10, updatedAt: new Date().toISOString() } };
        const denied = await authed('post', `/api/v1/entity-sync/${type}`, posToken).send({ events: [event] });
        expect(denied.status).toBe(403);
        const saved = await authed('post', `/api/v1/entity-sync/${type}`, posAdminToken).send({ events: [event] });
        expect(saved.status).toBe(201); expect(saved.body.results[0].status).toBe('ok');
        const otherBranch = await authed('get', `/api/v1/entity-sync/${type}`, posToken);
        expect(otherBranch.status).toBe(200);
        expect(otherBranch.body.entities.some((row: any) => row.externalId === id)).toBe(type === 'SUPPLIER');
        if (type !== 'SUPPLIER') {
          const spoof = await authed('post', `/api/v1/entity-sync/${type}`, posAdminToken).send({ events: [{ ...event, payload: { ...event.payload, branchId: branches[1].id } }] });
          expect(spoof.body.results[0].status).toBe('error');
        }
        const removed = await authed('post', `/api/v1/entity-sync/${type}`, posAdminToken).send({ events: [{ externalId: id, payload: { id, deleted: true, updatedAt: new Date().toISOString() } }] });
        expect(removed.body.results[0].status).toBe('ok');
        const tombstone = (await authed('get', `/api/v1/entity-sync/${type}`, posAdminToken)).body.entities.find((row: any) => row.externalId === id);
        expect(tombstone.payload.deleted).toBe(true);
        if (type !== 'SUPPLIER') expect(tombstone.payload.branchId).toBe(branches[0].id);
      }
    } finally {
      await prisma.runAsTenant(restaurantId, tx => Promise.all([
        tx.device.update({ where: { id: admin.id }, data: { branchId: admin.branchId } }),
        tx.device.update({ where: { id: pos.id }, data: { branchId: pos.branchId } })
      ]));
      await prisma.runAsTenant(restaurantId, tx => tx.syncedEntity.deleteMany({ where: { restaurantId, externalId: { startsWith: 'master-fix-' } } }));
      await prisma.runAsTenant(restaurantId, tx => tx.branch.deleteMany({ where: { id: { in: branches.map(branch => branch.id) } } }));
    }
  });

  it('replays 501 old entities with tied timestamps without skipping the second page', async () => {
    const baseline = await prisma.runAsTenant(restaurantId, (tx) => tx.syncedEntity.aggregate({ where: { restaurantId }, _max: { seq: true } }));
    const after = baseline._max.seq ?? 0;
    await prisma.runAsTenant(restaurantId, (tx) => tx.syncedEntity.createMany({ data: Array.from({ length: 501 }, (_, i) => ({
      restaurantId, entityType: 'INVENTORY_ITEM', externalId: `sequence-tie-${i}`, payload: { id: `sequence-tie-${i}` }, updatedAt: new Date('2000-01-01T00:00:00Z')
    })) }));
    const first = await authed('get', `/api/v1/entity-sync/INVENTORY_ITEM?afterSeq=${after}`, posAdminToken);
    expect(first.status).toBe(200); expect(first.body.entities).toHaveLength(500); expect(first.body.hasMore).toBe(true);
    const second = await authed('get', `/api/v1/entity-sync/INVENTORY_ITEM?afterSeq=${first.body.latestSeq}`, posAdminToken);
    expect(second.status).toBe(200); expect(second.body.entities).toHaveLength(1); expect(second.body.hasMore).toBe(false);
    expect(new Set([...first.body.entities, ...second.body.entities].map((e: any) => e.externalId)).size).toBe(501);
  });

  it('advances over an entirely filtered table page and refuses writes across branches', async () => {
    const device = await prisma.runAsTenant(restaurantId, (tx) => tx.device.findFirstOrThrow({ where: { restaurantId, type: 'POS' } }));
    const originalBranch = device.branchId;
    const branches = await prisma.runAsTenant(restaurantId, async (tx) => Promise.all(['Sequence A', 'Sequence B'].map((name) => tx.branch.create({ data: { restaurantId, name, code: name.replaceAll(' ', '_') } }))));
    try {
      await prisma.runAsTenant(restaurantId, (tx) => tx.device.update({ where: { id: device.id }, data: { branchId: branches[0].id } }));
      const baseline = await prisma.runAsTenant(restaurantId, (tx) => tx.syncedEntity.aggregate({ where: { restaurantId }, _max: { seq: true } }));
      await prisma.runAsTenant(restaurantId, (tx) => tx.syncedEntity.createMany({ data: Array.from({ length: 501 }, (_, i) => ({
        restaurantId, entityType: 'DINING_TABLE', externalId: `filtered-${i}`, payload: { id: `filtered-${i}`, branchId: branches[i < 500 ? 1 : 0].id }
      })) }));
      const first = await authed('get', `/api/v1/entity-sync/DINING_TABLE?afterSeq=${baseline._max.seq ?? 0}`, posToken);
      expect(first.body.entities).toEqual([]); expect(first.body.hasMore).toBe(true);
      const second = await authed('get', `/api/v1/entity-sync/DINING_TABLE?afterSeq=${first.body.latestSeq}`, posToken);
      expect(second.body.entities.map((e: any) => e.externalId)).toEqual(['filtered-500']);
      const denied = await authed('post', '/api/v1/entity-sync/DINING_TABLE', posToken).send({ events: [{ externalId: 'filtered-0', payload: { id: 'filtered-0', branchId: branches[0].id, updatedAt: new Date().toISOString() } }] });
      expect(denied.body.results[0].status).toBe('error');
      expect((await prisma.runAsTenant(restaurantId, (tx) => tx.syncedEntity.findFirstOrThrow({ where: { restaurantId, externalId: 'filtered-0' } }))).payload).toMatchObject({ branchId: branches[1].id });
    } finally {
      await prisma.runAsTenant(restaurantId, (tx) => tx.device.update({ where: { id: device.id }, data: { branchId: originalBranch } }));
      await prisma.runAsTenant(restaurantId, (tx) => tx.syncedEntity.deleteMany({ where: { restaurantId, externalId: { startsWith: 'filtered-' } } }));
      await prisma.runAsTenant(restaurantId, (tx) => tx.branch.deleteMany({ where: { id: { in: branches.map((b) => b.id) } } }));
    }
  });

});
