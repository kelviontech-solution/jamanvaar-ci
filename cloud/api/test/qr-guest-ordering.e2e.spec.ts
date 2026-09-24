import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * BUG-119: a guest scans a table's QR code with their own phone - no login, no device credential - sees the
 * real menu, places a real order, and it reaches POS/KDS the same way any other order does (SyncedOrder, the
 * exact table every device already pulls from). Nothing here is served from, or reads out of, any terminal's
 * own local storage: everything comes from the cloud, resolved from the token alone.
 */
describe('QR guest ordering (BUG-119)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-qr-guest-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  let posToken: string;

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  const posAuthed = (method: 'get' | 'post', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${posToken}`);
  const guest = (method: 'get' | 'post', url: string) => request(app.getHttpServer())[method](url);

  const QR_TOKEN = `jv_qr_tbl_1_${Date.now()}abcdef0123456789`;
  const ITEM_ID = 'item-e2e-thali';
  const CATEGORY_ID = 'cat-e2e-mains';

  async function pushTable(overrides: Record<string, unknown> = {}) {
    return posAuthed('post', '/api/v1/entity-sync/DINING_TABLE').send({
      events: [
        {
          externalId: 'tbl-e2e-1',
          payload: {
            id: 'tbl-e2e-1',
            tableNumber: '1',
            capacity: 4,
            zone: 'Main Hall',
            floor: 1,
            isActive: true,
            status: 'AVAILABLE',
            qrToken: QR_TOKEN,
            qrStatus: 'ACTIVE',
            updatedAt: new Date().toISOString(),
            ...overrides
          }
        }
      ]
    });
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await platformLogin(app, adminEmail, adminPassword);
    platformToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST QR Guest Restaurant ${Date.now()}`,
      ownerName: 'QR Guest Owner',
      ownerEmail: `qr-guest-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;

    const planRes = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO', name: `TEST QR Guest Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { qrTableOrdering: true }
    });
    planId = planRes.body.id;
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
    const keyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const redeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: keyRes.body.code, deviceType: 'POS' });
    posToken = redeemRes.body.deviceToken;

    await pushTable();
    await posAuthed('post', '/api/v1/entity-sync/MENU_CATEGORY').send({
      events: [{ externalId: CATEGORY_ID, payload: { id: CATEGORY_ID, name: 'Mains', isActive: true, sortOrder: 1, updatedAt: new Date().toISOString() } }]
    });
    await posAuthed('post', '/api/v1/entity-sync/MENU_ITEM').send({
      events: [
        {
          externalId: ITEM_ID,
          payload: {
            id: ITEM_ID,
            categoryId: CATEGORY_ID,
            name: 'Thali',
            price: 200,
            isAvailable: true,
            modifierGroupIds: ['mod-addons'],
            updatedAt: new Date().toISOString()
          }
        }
      ]
    });
  }, 60_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('resolves the real menu from a bare token, with no login and no device credential', async () => {
    const res = await guest('get', `/api/v1/qr-guest/session?token=${QR_TOKEN}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.table).toMatchObject({ tableNumber: '1', capacity: 4 });
    expect(res.body.items.map((i: { externalItemId: string }) => i.externalItemId)).toContain(ITEM_ID);
    expect(res.body.categories.map((c: { id: string }) => c.id)).toContain(CATEGORY_ID);
    expect(res.body.modifierGroups.find((g: { id: string }) => g.id === 'mod-addons')).toBeTruthy();
  });

  it('refuses a token nobody printed', async () => {
    const res = await guest('get', `/api/v1/qr-guest/session?token=jv_qr_tbl_nope_${'x'.repeat(20)}`);
    expect(res.status).toBe(404);
  });

  let placedOrderId: string;

  it('places a real order, priced server-side, that a real POS terminal pulls (reaches POS/KDS)', async () => {
    const idempotencyKey = `e2e-${Date.now()}`;
    const res = await guest('post', '/api/v1/qr-guest/orders').send({
      token: QR_TOKEN,
      items: [{ externalItemId: ITEM_ID, quantity: 2, selectedOptionIds: ['opt-cheese'] }],
      customerName: 'Live Verify Guest',
      idempotencyKey
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.tokenNumber).toMatch(/^QR-\d+$/);
    // 2x (Rs 200 + Rs 35 cheese) = Rs 470 subtotal, +5% GST = Rs 493.50
    expect(res.body.totalAmount).toBe(493.5);
    placedOrderId = res.body.externalOrderId;

    // The exact same pull every real terminal already uses.
    const pull = await posAuthed('get', '/api/v1/orders/sync');
    const mirrored = pull.body.orders.find((o: { externalOrderId: string }) => o.externalOrderId === placedOrderId);
    expect(mirrored).toBeTruthy();
    expect(mirrored.status).toBe('PREPARING');
    expect(mirrored.tableLabel).toBe('1');
    expect(mirrored.totalAmount).toBe(49350); // paise
    expect(mirrored.paymentStatus).toBe('PENDING'); // BUG-151: not a sale until the counter settles it

    // A second submit with the SAME idempotency key must not create a second order.
    const retry = await guest('post', '/api/v1/qr-guest/orders').send({
      token: QR_TOKEN,
      items: [{ externalItemId: ITEM_ID, quantity: 2, selectedOptionIds: ['opt-cheese'] }],
      idempotencyKey
    });
    expect(retry.body.externalOrderId).toBe(placedOrderId);
    const pullAgain = await posAuthed('get', '/api/v1/orders/sync?since=1970-01-01T00:00:00.000Z');
    expect(pullAgain.body.orders.filter((o: { externalOrderId: string }) => o.externalOrderId === placedOrderId)).toHaveLength(1);
  });

  it('lets the guest poll their own order status by token, and refuses a wrong token', async () => {
    const ok = await guest('get', `/api/v1/qr-guest/orders/${placedOrderId}?token=${QR_TOKEN}`);
    expect(ok.status).toBe(200);
    expect(ok.body.tokenNumber).toMatch(/^QR-\d+$/);

    const wrong = await guest('get', `/api/v1/qr-guest/orders/${placedOrderId}?token=jv_qr_tbl_other_${'y'.repeat(20)}`);
    expect(wrong.status).toBe(404);
  });

  it('rejects a client-submitted price - the server always recomputes from the synced menu', async () => {
    const res = await guest('post', '/api/v1/qr-guest/orders').send({
      token: QR_TOKEN,
      items: [{ externalItemId: ITEM_ID, quantity: 1, selectedOptionIds: [] }, { unitPrice: 1 } as never],
      idempotencyKey: `e2e-badprice-${Date.now()}`
    });
    // The malformed second line is rejected by validation before pricing ever runs.
    expect(res.status).toBe(400);
  });

  it('refuses an unknown menu item and an unknown modifier option', async () => {
    const badItem = await guest('post', '/api/v1/qr-guest/orders').send({
      token: QR_TOKEN,
      items: [{ externalItemId: 'not-a-real-item', quantity: 1, selectedOptionIds: [] }],
      idempotencyKey: `e2e-baditem-${Date.now()}`
    });
    expect(badItem.status).toBe(400);

    const badOption = await guest('post', '/api/v1/qr-guest/orders').send({
      token: QR_TOKEN,
      items: [{ externalItemId: ITEM_ID, quantity: 1, selectedOptionIds: ['not-a-real-option'] }],
      idempotencyKey: `e2e-badoption-${Date.now()}`
    });
    expect(badOption.status).toBe(400);
  });

  it('refuses ordering once the table QR is disabled, and a regenerated token supersedes the old one', async () => {
    await pushTable({ qrStatus: 'DISABLED', updatedAt: new Date(Date.now() + 60_000).toISOString() });
    const res = await guest('get', `/api/v1/qr-guest/session?token=${QR_TOKEN}`);
    expect(res.status).toBe(410);

    const newToken = `jv_qr_tbl_1_regenerated_${Date.now()}`;
    await pushTable({ qrToken: newToken, qrStatus: 'ACTIVE', updatedAt: new Date(Date.now() + 120_000).toISOString() });
    expect((await guest('get', `/api/v1/qr-guest/session?token=${newToken}`)).status).toBe(200);
    // The table's earlier sticker is now a dead link (superseded, not merely unknown - 410, not 404), not a
    // second live session on the same table.
    expect((await guest('get', `/api/v1/qr-guest/session?token=${QR_TOKEN}`)).status).toBe(410);
  });

  it('refuses a restaurant that is not entitled to QR ordering (CORE plan)', async () => {
    const coreRestaurant = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST QR Guest Core ${Date.now()}`,
      ownerName: 'Core Owner',
      ownerEmail: `qr-guest-core-owner-${Date.now()}@test.example.com`
    });
    const coreRestaurantId = coreRestaurant.body.restaurant.id;
    const corePlan = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'CORE', name: `TEST QR Guest Core Plan ${Date.now()}`, priceMonthly: 500000, maxBranches: 1, maxDevices: 5, maxUsers: 5, entitlements: { pos: true }
    });
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId: coreRestaurantId, planId: corePlan.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
    const coreKey = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId: coreRestaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const coreRedeem = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: coreKey.body.code, deviceType: 'POS' });
    const coreToken = `jv_qr_tbl_core_${Date.now()}`;
    await request(app.getHttpServer())
      .post('/api/v1/entity-sync/DINING_TABLE')
      .set('Authorization', `Bearer ${coreRedeem.body.deviceToken}`)
      .send({ events: [{ externalId: 'tbl-core-1', payload: { id: 'tbl-core-1', tableNumber: '1', isActive: true, qrToken: coreToken, qrStatus: 'ACTIVE', updatedAt: new Date().toISOString() } }] });

    const res = await guest('get', `/api/v1/qr-guest/session?token=${coreToken}`);
    expect(res.status).toBe(410);

    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: coreRestaurantId } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: corePlan.body.id } }));
  });
});
