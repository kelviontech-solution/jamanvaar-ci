import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Kiosk Pro remote fleet management (Phase 13)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const stamp = Date.now();
  const adminEmail = `test-kiosk-pro-${stamp}@example.com`;
  const restaurantIds: string[] = [];
  const planIds: string[] = [];
  const api = (method: 'get' | 'post', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  async function kioskDevice(tier: 'CORE' | 'PRO', n: number): Promise<string> {
    const rest = await api('post', '/api/v1/restaurants').send({
      name: `TEST KioskPro ${tier} ${stamp}`, ownerName: 'Owner', ownerEmail: `kioskpro-${tier}-${n}-${stamp}@test.example.com`
    });
    const restaurantId = rest.body.restaurant.id as string;
    restaurantIds.push(restaurantId);
    const plan = await api('post', '/api/v1/plans').send({
      tier, productFamily: 'KIOSK', name: `TEST KioskPro Plan ${tier} ${stamp}`, priceMonthly: 900000,
      maxBranches: 1, maxDevices: 3, maxUsers: 5, entitlements: {}
    });
    planIds.push(plan.body.id);
    await api('post', '/api/v1/subscriptions').send({
      restaurantId, planId: plan.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString()
    });
    const key = await api('post', '/api/v1/activation-keys').send({
      restaurantId, allowedDeviceType: 'KIOSK', expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    const redeemed = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: 'KIOSK' });
    expect(redeemed.status).toBe(201);
    const device = await prisma.runAsPlatform((tx) => tx.device.findFirstOrThrow({ where: { restaurantId, type: 'KIOSK' } }));
    return device.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    token = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: restaurantIds } } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: { in: planIds } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('Kiosk Standard: refuses remote restart/clear-cache/diagnostics but still allows lock and unlock', async () => {
    const id = await kioskDevice('CORE', 1);
    for (const commandType of ['RESTART_APP', 'CLEAR_CACHE', 'REQUEST_DIAGNOSTICS']) {
      const res = await api('post', `/api/v1/devices/${id}/commands`).send({ commandType });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/Kiosk Pro/);
    }
    expect((await api('post', `/api/v1/devices/${id}/lock`).send({ reason: 'test' })).status).toBe(201);
    expect((await api('post', `/api/v1/devices/${id}/unlock`).send({})).status).toBe(201);
  });

  it('Kiosk Pro: allows remote restart, clear-cache and diagnostics', async () => {
    const id = await kioskDevice('PRO', 2);
    for (const commandType of ['RESTART_APP', 'CLEAR_CACHE', 'REQUEST_DIAGNOSTICS']) {
      const res = await api('post', `/api/v1/devices/${id}/commands`).send({ commandType });
      expect(res.status).toBe(201);
    }
  });

  it('the Feature catalog lists Kiosk remote management as a real, KIOSK-dependent feature', async () => {
    const f = await prisma.runAsPlatform((tx) => tx.feature.findUniqueOrThrow({ where: { code: 'kioskRemoteManagement' } }));
    const kiosk = await prisma.runAsPlatform((tx) => tx.feature.findUniqueOrThrow({ where: { code: 'selfOrderKiosk' } }));
    expect(f.dependsOnFeatureIds).toEqual([kiosk.id]);
  });
});
