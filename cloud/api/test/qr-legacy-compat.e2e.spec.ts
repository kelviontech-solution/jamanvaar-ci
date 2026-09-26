import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { QrRateLimiter } from '../src/modules/qr/qr-rate-limit';

/**
 * Codes printed before the server took over minting (`jv_qr_tbl_...`, created in the Restaurant Admin browser)
 * keep working, through the same pipeline, without ever being able to touch another restaurant's code:
 *   - a legacy token is mirrored as an ACTIVE code for the restaurant that pushed it, and nobody else
 *   - an existing token can never be re-pointed (the defect suspected in plan phase P0, proven not to exist)
 *   - the deprecated /api/v1/qr-guest adapter serves the old page through the new services
 */
describe('QR legacy codes and the deprecated guest adapter', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-qr-legacy-${stamp}@example.com`;
  let platformToken: string;
  const restaurantIds: string[] = [];
  const planIds: string[] = [];

  const http = () => request(app.getHttpServer());
  const platform = (method: 'get' | 'post', url: string) => http()[method](url).set('Authorization', `Bearer ${platformToken}`);
  const as = (method: 'get' | 'post', url: string, token: string) => http()[method](url).set('Authorization', `Bearer ${token}`);

  async function restaurant(name: string, planId: string) {
    const rest = await platform('post', '/api/v1/restaurants').send({ name: `TEST ${name} ${stamp}`, ownerName: 'Owner', ownerEmail: `${name.toLowerCase()}-${stamp}@test.example.com` });
    const id = rest.body.restaurant.id as string;
    restaurantIds.push(id);
    await platform('post', '/api/v1/subscriptions').send({ restaurantId: id, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
    return id;
  }
  async function activate(restaurantId: string, type: string, branchId?: string) {
    const key = await platform('post', '/api/v1/activation-keys').send({ restaurantId, ...(branchId ? { branchId } : {}), allowedDeviceType: type, expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const res = await http().post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: type });
    return res.body.deviceToken as string;
  }
  const push = (token: string, type: string, externalId: string, payload: Record<string, unknown>) =>
    as('post', `/api/v1/entity-sync/${type}`, token).send({ events: [{ externalId, payload: { id: externalId, ...payload, updatedAt: new Date().toISOString() } }] });

  let posA: string;
  let posB: string;
  let posOther: string;
  let branchA: string;
  let branchB: string;
  let restA: string;
  const legacyToken = `jv_qr_tbl_1_${stamp}abcdef0123456789`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    app.get(QrRateLimiter).configure({ ipRequestsPerMinute: 100000, ipFailedLookupsPerMinute: 100000, tokenRequestsPerMinute: 100000, tokenOrdersPerMinute: 100000, sessionOrdersPerMinute: 100000, orderStatusPerMinute: 100000 });
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;
    const plan = await platform('post', '/api/v1/plans').send({ tier: 'QR', name: `TEST Legacy Plan ${stamp}`, priceMonthly: 900000, maxBranches: 5, maxDevices: 30, maxUsers: 30, entitlements: { posTerminal: true, restaurantAdmin: true, qrTableOrdering: true } });
    planIds.push(plan.body.id);
    restA = await restaurant('QrLegacyA', plan.body.id);
    branchA = (await platform('post', '/api/v1/branches').send({ restaurantId: restA, name: 'Legacy A', code: 'LGA' })).body.id;
    branchB = (await platform('post', '/api/v1/branches').send({ restaurantId: restA, name: 'Legacy B', code: 'LGB' })).body.id;
    posA = await activate(restA, 'POS', branchA);
    posB = await activate(restA, 'POS', branchB);
    await push(posA, 'MENU_CATEGORY', 'cat-l', { name: 'Mains', isActive: true, sortOrder: 1 });
    await push(posA, 'MENU_ITEM', 'itm-l', { categoryId: 'cat-l', name: 'Legacy Dish', price: 100, isAvailable: true, modifierGroupIds: [] });
    await push(posA, 'DINING_TABLE', 'tbl-l1', { tableNumber: '1', capacity: 4, isActive: true, qrToken: legacyToken, qrStatus: 'ACTIVE', branchId: branchA });
    const other = await restaurant('QrLegacyOther', plan.body.id);
    posOther = await activate(other, 'POS');
  }, 120_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: restaurantIds } } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: { in: planIds } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('a printed legacy token is mirrored as an active, branch-bound code and opens through the new public API', async () => {
    const row = await prisma.runAsPlatform((tx) => tx.qrCode.findUnique({ where: { publicToken: legacyToken } }));
    expect(row).toMatchObject({ restaurantId: restA, branchId: branchA, status: 'ACTIVE', mode: 'TABLE_ORDER', tableId: 'tbl-l1' });
    expect(row?.metadata).toMatchObject({ legacy: true });
    const info = await http().get(`/api/v1/public/qr/${legacyToken}`);
    expect(info.status, JSON.stringify(info.body)).toBe(200);
    expect(info.body.table.displayNumber).toBe('1');
  });

  it('another restaurant pushing a table with this token cannot take it over, and the token still serves its owner', async () => {
    await push(posOther, 'DINING_TABLE', 'tbl-evil', { tableNumber: '9', isActive: true, qrToken: legacyToken, qrStatus: 'ACTIVE' });
    const row = await prisma.runAsPlatform((tx) => tx.qrCode.findUnique({ where: { publicToken: legacyToken } }));
    expect(row?.restaurantId).toBe(restA);
    expect((await http().get(`/api/v1/public/qr/${legacyToken}`)).body.restaurant.name).toContain('QrLegacyA');
  });

  it('only tokens shaped like the old client\'s are ever mirrored: a terminal cannot mint an arbitrary token', async () => {
    await push(posA, 'DINING_TABLE', 'tbl-l2', { tableNumber: '2', isActive: true, qrToken: 'i-chose-this-token-myself', qrStatus: 'ACTIVE', branchId: branchA });
    const row = await prisma.runAsPlatform((tx) => tx.qrCode.findUnique({ where: { publicToken: 'i-chose-this-token-myself' } }));
    expect(row).toBeNull();
  });

  it('an order through a legacy code reaches the right branch by cursor and no other branch', async () => {
    const placed = await http().post(`/api/v1/public/qr/${legacyToken}/orders`).send({ items: [{ itemId: 'itm-l', quantity: 1, optionIds: [] }], idempotencyKey: `legacy-${stamp}-key` });
    expect(placed.status, JSON.stringify(placed.body)).toBe(201);
    const a = await as('get', '/api/v1/orders/sync?afterSeq=0', posA);
    const b = await as('get', '/api/v1/orders/sync?afterSeq=0', posB);
    expect(a.body.orders.some((o: { publicOrderId: string }) => o.publicOrderId === placed.body.publicOrderId)).toBe(true);
    expect(b.body.orders.some((o: { publicOrderId: string }) => o.publicOrderId === placed.body.publicOrderId)).toBe(false);
  });

  it('the deprecated /qr-guest adapter serves the old page through the new services: same authorization, pricing and idempotency', async () => {
    const session = await http().get(`/api/v1/qr-guest/session?token=${legacyToken}`);
    expect(session.status, JSON.stringify(session.body)).toBe(200);
    expect(session.body.table.tableNumber).toBe('1');
    expect(session.body.items.map((i: { externalItemId: string }) => i.externalItemId)).toContain('itm-l');
    const body = { token: legacyToken, items: [{ externalItemId: 'itm-l', quantity: 2, selectedOptionIds: [] }], idempotencyKey: `adapter-${stamp}-key` };
    const one = await http().post('/api/v1/qr-guest/orders').send(body);
    const two = await http().post('/api/v1/qr-guest/orders').send(body);
    expect(one.status, JSON.stringify(one.body)).toBe(201);
    expect(two.body.externalOrderId).toBe(one.body.externalOrderId);
    expect(one.body.totalAmount).toBe(200);
    expect((await http().get(`/api/v1/qr-guest/orders/${one.body.externalOrderId}`)).status).toBe(200);
    // a body that names a restaurant is refused here too
    expect((await http().post('/api/v1/qr-guest/orders').send({ ...body, restaurantId: 'x' })).status).toBe(400);
  });
});
