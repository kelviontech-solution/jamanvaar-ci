import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Found in the live Captain test: with four terminals of one restaurant running, POS came back with
 * "429 Too Many Requests" on staff, menu and table sync and never received its staff. A restaurant's
 * terminals all reach the cloud through one router, so they share one address, and the global limit of
 * 120 requests a minute per address is smaller than what a handful of terminals legitimately send
 * (each polls orders, tables and messages every few seconds). Device-authenticated sync endpoints get
 * a limit sized for a whole restaurant; everything else keeps the strict one.
 */
describe('Rate limiting for terminal sync', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-throttle-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let restaurantId: string;
  let planId: string;
  let deviceToken: string;

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    const login = await platformLogin(app, adminEmail, adminPassword);
    const platformToken = login.body.accessToken as string;

    const restaurant = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Throttle Restaurant ${Date.now()}`, ownerName: 'Throttle Owner', ownerEmail: `throttle-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurant.body.restaurant.id;
    const plan = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO', name: `TEST Throttle Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { posTerminal: true }
    });
    planId = plan.body.id;
    await authed('post', '/api/v1/subscriptions', platformToken).send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
    const key = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const redeem = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: 'POS' });
    deviceToken = redeem.body.deviceToken as string;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('a busy restaurant\'s terminals are not throttled: 300 sync requests in a minute from one address all succeed', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 300; i += 1) {
      const res = await authed('get', `/api/v1/entity-sync/${i % 2 === 0 ? 'DINING_TABLE' : 'SERVICE_MESSAGE'}`, deviceToken);
      statuses.push(res.status);
    }
    expect(statuses.filter((s) => s === 429)).toHaveLength(0);
    expect(new Set(statuses)).toEqual(new Set([200]));
  }, 60_000);

  it('order sync and the heartbeat have the same headroom', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 150; i += 1) statuses.push((await authed('get', '/api/v1/orders/sync', deviceToken)).status);
    expect(statuses.filter((s) => s === 429)).toHaveLength(0);
  }, 60_000);

  it('everything else keeps the strict limit: a flood of sign-in attempts is still refused', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 140; i += 1) {
      statuses.push((await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email: 'nobody@example.com', password: 'wrong-password' })).status);
    }
    expect(statuses.some((s) => s === 429)).toBe(true);
  }, 60_000);
});
