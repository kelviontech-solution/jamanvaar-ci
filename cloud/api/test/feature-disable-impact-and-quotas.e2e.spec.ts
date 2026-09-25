import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Disable-impact warning and per-app default quotas (Phase 14)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const stamp = Date.now();
  const adminEmail = `test-impact-${stamp}@example.com`;
  let restaurantId: string;
  let planId: string;
  let subscriptionId: string;
  const api = (method: 'get' | 'post' | 'patch', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  async function redeem(deviceType: string) {
    const key = await api('post', '/api/v1/activation-keys').send({ restaurantId, allowedDeviceType: deviceType, expiresAt: new Date(Date.now() + 86400000).toISOString() });
    return request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType });
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    token = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;
    const rest = await api('post', '/api/v1/restaurants').send({ name: `TEST Impact ${stamp}`, ownerName: 'Owner', ownerEmail: `impact-${stamp}@test.example.com` });
    restaurantId = rest.body.restaurant.id;
    const plan = await api('post', '/api/v1/plans').send({
      tier: 'PRO', name: `TEST Impact Plan ${stamp}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 5, maxUsers: 10, entitlements: {}
    });
    planId = plan.body.id;
    const sub = await api('post', '/api/v1/subscriptions').send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
    subscriptionId = sub.body.id;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.feature.updateMany({ where: { appCode: 'KDS' }, data: { defaultDeviceQuota: null } }));
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('refuses disabling an app that still has active devices until the impact is acknowledged', async () => {
    expect((await redeem('CAPTAIN')).status).toBe(201);
    const refused = await api('patch', `/api/v1/subscriptions/${subscriptionId}/applications/CAPTAIN`).send({ enabled: false });
    expect(refused.status).toBe(409);
    expect(refused.body.message).toMatch(/1 active CAPTAIN device/);

    const ok = await api('patch', `/api/v1/subscriptions/${subscriptionId}/applications/CAPTAIN`).send({ enabled: false, acknowledgeDeviceImpact: true });
    expect(ok.status).toBe(200);
    expect(ok.body.enabled).toBe(false);
  });

  it('disabling an app with no active devices needs no acknowledgement', async () => {
    const res = await api('patch', `/api/v1/subscriptions/${subscriptionId}/applications/KDS`).send({ enabled: false });
    expect(res.status).toBe(200);
    await api('patch', `/api/v1/subscriptions/${subscriptionId}/applications/KDS`).send({ enabled: true });
  });

  it('a Feature-level defaultDeviceQuota caps that app, overriding the plan-wide maxDevices', async () => {
    const kds = await prisma.runAsPlatform((tx) => tx.feature.findFirstOrThrow({ where: { appCode: 'KDS' } }));
    const set = await api('patch', `/api/v1/features/${kds.id}`).send({ defaultDeviceQuota: 1 });
    expect(set.status).toBe(200);

    expect((await redeem('KDS')).status).toBe(201);
    const second = await redeem('KDS');
    expect(second.status).toBe(409);
    expect(second.body.message).toMatch(/1 device/);
  });
});
