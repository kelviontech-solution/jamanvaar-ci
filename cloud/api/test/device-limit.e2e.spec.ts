import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * BUG-061: a plan's `maxDevices` was stored and shown ("Plan Quotas") but never checked —
 * a restaurant could redeem any number of activation keys regardless of its plan. Redeeming
 * a key that would exceed the plan's device limit is now refused with a clear reason;
 * revoking a device frees its seat back up.
 */
describe('Plan device limit enforcement (BUG-061)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-devlimit-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let token: string;
  let restaurantId: string;
  let planId: string;

  const api = (method: 'get' | 'post' | 'patch', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  async function redeem(deviceType: string) {
    const key = await api('post', '/api/v1/activation-keys').send({ restaurantId, allowedDeviceType: deviceType, expiresAt: new Date(Date.now() + 86400000).toISOString() });
    if (key.status !== 201) return { keyStatus: key.status, keyBody: key.body };
    const res = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType });
    return { keyStatus: key.status, status: res.status, body: res.body };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    token = (await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email: adminEmail, password: adminPassword })).body.accessToken;

    const rest = await api('post', '/api/v1/restaurants').send({ name: `TEST DevLimit ${Date.now()}`, ownerName: 'Owner', ownerEmail: `devlimit-${Date.now()}@test.example.com` });
    restaurantId = rest.body.restaurant.id;
    const plan = await api('post', '/api/v1/plans').send({
      tier: 'PRO', name: `TEST DevLimit Plan ${Date.now()}`, priceMonthly: 100000, maxBranches: 3, maxDevices: 2, maxUsers: 10,
      entitlements: { pos: true, kds: true, captain: true }
    });
    planId = plan.body.id;
    await api('post', '/api/v1/subscriptions').send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('redeems up to the plan limit, then refuses the next one with a clear reason', async () => {
    const first = await redeem('POS');
    expect(first.status).toBe(201);
    const second = await redeem('KDS');
    expect(second.status).toBe(201);

    const third = await redeem('CAPTAIN');
    expect(third.status).toBe(409);
    expect(third.body.message).toMatch(/device limit|maxDevices|2 device/i);
  });

  it('revoking a device frees its seat so a new one can be redeemed', async () => {
    const devices = await prisma.runAsPlatform((tx) => tx.device.findMany({ where: { restaurantId } }));
    expect(devices.length).toBe(2);
    await api('patch', `/api/v1/devices/${devices[0].id}/revoke`);

    const res = await redeem('CAPTAIN');
    expect(res.status).toBe(201);
  });
});
