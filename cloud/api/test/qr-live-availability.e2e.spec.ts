import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { QrRateLimiter } from '../src/modules/qr/qr-rate-limit';

/**
 * A dish that runs out (a cook sells it out, or its stock hits zero and the counter switches it off) must stop being offered to
 * guests at once, without the restaurant re-publishing the menu. The published menu stays the source of prices; only "is it
 * available right now" is read live.
 */
describe('QR menu: what has run out is not offered, live', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-qr-live-${stamp}@example.com`;
  let platformToken: string;
  let restaurantId = '';
  let planId = '';
  let consoleToken = '';
  let token = '';

  const http = () => request(app.getHttpServer());
  const platform = (method: 'get' | 'post', url: string) => http()[method](url).set('Authorization', `Bearer ${platformToken}`);
  const as = (method: 'get' | 'post' | 'put', url: string, t: string) => http()[method](url).set('Authorization', `Bearer ${t}`);
  const push = (type: string, externalId: string, payload: Record<string, unknown>) =>
    as('post', `/api/v1/entity-sync/${type}`, consoleToken).send({ events: [{ externalId, payload: { id: externalId, ...payload, updatedAt: new Date().toISOString() } }] });
  const menuNames = async () => (await http().get(`/api/v1/public/qr/${token}/menu`)).body.items.map((i: { name: string }) => i.name) as string[];
  const order = (itemId: string) =>
    http().post(`/api/v1/public/qr/${token}/orders`).send({ items: [{ itemId, quantity: 1, optionIds: [] }], idempotencyKey: `k-${Math.random().toString(36).slice(2)}-${Date.now()}` });

  beforeAll(async () => {
    process.env.QR_LIVE_AVAILABILITY_TTL_MS = '0';
    app = await createTestApp();
    prisma = app.get(PrismaService);
    app.get(QrRateLimiter).configure({ ipRequestsPerMinute: 100000, ipFailedLookupsPerMinute: 100000, tokenRequestsPerMinute: 100000, tokenOrdersPerMinute: 100000, sessionOrdersPerMinute: 100000, orderStatusPerMinute: 100000 });
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;

    const plan = await platform('post', '/api/v1/plans').send({
      tier: 'QR', name: `TEST Live ${stamp}`, priceMonthly: 900000, maxBranches: 2, maxDevices: 10, maxUsers: 10,
      entitlements: { posTerminal: true, restaurantAdmin: true, captainApp: true, kotKdsRouting: true, qrTableOrdering: true }
    });
    planId = plan.body.id;
    const rest = await platform('post', '/api/v1/restaurants').send({ name: `TEST QrLive ${stamp}`, ownerName: 'Owner', ownerEmail: `qrlive-${stamp}@test.example.com` });
    restaurantId = rest.body.restaurant.id;
    await platform('post', '/api/v1/subscriptions').send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
    const branchId = (await platform('post', '/api/v1/branches').send({ restaurantId, name: 'Live Main', code: 'LVM' })).body.id as string;
    const key = await platform('post', '/api/v1/activation-keys').send({ restaurantId, allowedDeviceType: 'POS_ADMIN', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    consoleToken = (await http().post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: 'POS_ADMIN' })).body.deviceToken;

    await push('TAX_GROUP', 'tax-l', { name: 'GST 5', cgstPercent: 2.5, sgstPercent: 2.5, igstPercent: 5, isInclusive: false, isActive: true });
    await push('MENU_CATEGORY', 'cat-l', { name: 'Mains', isActive: true, sortOrder: 1 });
    await push('MENU_ITEM', 'tea', { categoryId: 'cat-l', name: 'Masala Tea', price: 40, isAvailable: true, taxGroupId: 'tax-l', modifierGroupIds: [] });
    await push('MENU_ITEM', 'dal', { categoryId: 'cat-l', name: 'Dal Tadka', price: 180, isAvailable: true, taxGroupId: 'tax-l', modifierGroupIds: [] });
    await push('DINING_TABLE', 'tbl-l1', { tableNumber: '1', capacity: 4, isActive: true, branchId });
    expect((await as('post', '/api/v1/menu/publish', consoleToken).send({})).status).toBeLessThan(300);
    const gen = await as('post', '/api/v1/restaurant/qr/tables/tbl-l1/generate', consoleToken).send({ branchId });
    expect(gen.status, JSON.stringify(gen.body)).toBeLessThan(300);
    token = (gen.body.url as string).split('/q/')[1];
  }, 180_000);

  afterAll(async () => {
    delete process.env.QR_LIVE_AVAILABILITY_TTL_MS;
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('offers both dishes while both are available', async () => {
    expect(await menuNames()).toEqual(expect.arrayContaining(['Masala Tea', 'Dal Tadka']));
  });

  it('drops a dish the restaurant runs out of, with no re-publish, and refuses an order for it', async () => {
    await push('MENU_ITEM', 'dal', { categoryId: 'cat-l', name: 'Dal Tadka', price: 180, isAvailable: false, taxGroupId: 'tax-l', modifierGroupIds: [], soldOutReason: 'Out of stock: Toor dal' });
    const names = await menuNames();
    expect(names).toContain('Masala Tea');
    expect(names).not.toContain('Dal Tadka');
    const refused = await order('dal');
    expect(refused.status).toBe(400);
    expect(refused.body.message).toMatch(/not available/i);
    expect((await order('tea')).status).toBe(201);
  });

  it('changes the menu\'s ETag, so a guest\'s cached copy cannot keep showing a finished dish', async () => {
    const off = (await http().get(`/api/v1/public/qr/${token}/menu`)).headers.etag;
    await push('MENU_ITEM', 'dal', { categoryId: 'cat-l', name: 'Dal Tadka', price: 180, isAvailable: true, taxGroupId: 'tax-l', modifierGroupIds: [] });
    const on = await http().get(`/api/v1/public/qr/${token}/menu`).set('If-None-Match', off);
    expect(on.status).toBe(200);
    expect(on.headers.etag).not.toBe(off);
  });

  it('brings the dish back when it is restocked, and it can be ordered again', async () => {
    expect(await menuNames()).toContain('Dal Tadka');
    expect((await order('dal')).status).toBe(201);
  });
});
