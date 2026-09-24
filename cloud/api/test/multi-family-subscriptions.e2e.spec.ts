import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Multi-family subscriptions (Phase 2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const stamp = Date.now();
  const adminEmail = `test-multifam-${stamp}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  const createdRestaurantIds: string[] = [];
  const createdPlanIds: string[] = [];
  let restaurantId: string;
  let restaurantPlanId: string;
  let kioskPlanId: string;
  const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    token = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;

    const restaurant = await auth(request(app.getHttpServer()).post('/api/v1/restaurants')).send({
      name: `TEST Multifam ${stamp}`, mobile: `9${String(stamp).slice(-9)}`, ownerName: 'Owner', ownerEmail: `multifam-${stamp}@example.com`
    });
    restaurantId = restaurant.body.restaurant.id;
    createdRestaurantIds.push(restaurantId);

    const restaurantPlan = await auth(request(app.getHttpServer()).post('/api/v1/plans')).send({
      tier: 'PRO', name: `TEST Multifam Restaurant Plan ${stamp}`, priceMonthly: 700000, maxBranches: 5, maxDevices: 3, maxUsers: 10, entitlements: {}
    });
    restaurantPlanId = restaurantPlan.body.id;
    createdPlanIds.push(restaurantPlanId);

    const kioskPlan = await auth(request(app.getHttpServer()).post('/api/v1/plans')).send({
      tier: 'CORE', name: `TEST Multifam Kiosk Plan ${stamp}`, productFamily: 'KIOSK', priceMonthly: 900000, maxBranches: 5, maxDevices: 2, maxUsers: 10, entitlements: {}
    });
    kioskPlanId = kioskPlan.body.id;
    createdPlanIds.push(kioskPlanId);
  });

  afterAll(async () => {
    if (createdRestaurantIds.length) await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } }));
    if (createdPlanIds.length) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: { in: createdPlanIds } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('assigns a RESTAURANT-family subscription', async () => {
    const res = await auth(request(app.getHttpServer()).post('/api/v1/subscriptions')).send({
      restaurantId, planId: restaurantPlanId, status: 'ACTIVE', expiresAt: inDays(365),
      // Excludes KIOSK/KIOSK_ADMIN even though PRO tier's defaults would otherwise include
      // them — this file's later tests need KIOSK granted by exactly one subscription (the
      // KIOSK-family one) to isolate per-app quota independence. Pre-Phase-5, PRO's defaults
      // still bundle Kiosk in; Phase 5 removes that bundling for real.
      applications: ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS']
    });
    expect(res.status).toBe(201);
  });

  it('rejects a second RESTAURANT-family subscription for the same restaurant', async () => {
    const secondRestaurantPlan = await auth(request(app.getHttpServer()).post('/api/v1/plans')).send({
      tier: 'CORE', name: `TEST Multifam Second Restaurant Plan ${stamp}`, priceMonthly: 500000, maxBranches: 1, maxDevices: 5, maxUsers: 10, entitlements: {}
    });
    createdPlanIds.push(secondRestaurantPlan.body.id);

    const res = await auth(request(app.getHttpServer()).post('/api/v1/subscriptions')).send({
      restaurantId, planId: secondRestaurantPlan.body.id, status: 'ACTIVE', expiresAt: inDays(365)
    });
    expect(res.status).toBe(409);
  });

  it('allows a concurrent KIOSK-family subscription for the same restaurant', async () => {
    const res = await auth(request(app.getHttpServer()).post('/api/v1/subscriptions')).send({
      restaurantId, planId: kioskPlanId, status: 'ACTIVE', expiresAt: inDays(365)
    });
    expect(res.status).toBe(201);
  });

  it('rejects a second KIOSK-family subscription once one is already active', async () => {
    const secondKioskPlan = await auth(request(app.getHttpServer()).post('/api/v1/plans')).send({
      tier: 'PRO', name: `TEST Multifam Second Kiosk Plan ${stamp}`, productFamily: 'KIOSK', priceMonthly: 1100000, maxBranches: 5, maxDevices: 5, maxUsers: 10, entitlements: {}
    });
    createdPlanIds.push(secondKioskPlan.body.id);

    const res = await auth(request(app.getHttpServer()).post('/api/v1/subscriptions')).send({
      restaurantId, planId: secondKioskPlan.body.id, status: 'ACTIVE', expiresAt: inDays(365)
    });
    expect(res.status).toBe(409);
  });

  it('an activation key can be generated for CAPTAIN (from the RESTAURANT/PRO sub, created before the KIOSK sub) and for KIOSK (from the KIOSK sub) on the same restaurant', async () => {
    // CAPTAIN is in PRO tier's default apps but not CORE's — the KIOSK subscription (CORE
    // tier) was created *after* the RESTAURANT one in this file's beforeAll/earlier tests, so
    // this only passes if isAppEnabled aggregates across every active subscription rather than
    // only checking the most recently created one.
    const captainKey = await auth(request(app.getHttpServer()).post('/api/v1/activation-keys')).send({
      restaurantId, allowedDeviceType: 'CAPTAIN', expiresAt: inDays(1)
    });
    expect(captainKey.status).toBe(201);

    // KIOSK/KIOSK_ADMIN aren't in CORE tier's default app list, so enable KIOSK explicitly on
    // the kiosk subscription first (Super Admin's existing per-app override path).
    const subsList = await auth(request(app.getHttpServer()).get('/api/v1/subscriptions'));
    const kioskSubscriptionId = subsList.body.find((s: { planId: string }) => s.planId === kioskPlanId).id;
    const enableKiosk = await auth(request(app.getHttpServer()).patch(`/api/v1/subscriptions/${kioskSubscriptionId}/applications/KIOSK`)).send({ enabled: true });
    expect(enableKiosk.status).toBe(200);

    const kioskKey = await auth(request(app.getHttpServer()).post('/api/v1/activation-keys')).send({
      restaurantId, allowedDeviceType: 'KIOSK', expiresAt: inDays(1)
    });
    expect(kioskKey.status).toBe(201);
  });

  it('device quota is enforced per app, independently — POS uses the RESTAURANT plan cap, KIOSK uses the KIOSK plan cap', async () => {
    const redeem = (code: string, deviceType: string) =>
      request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code, deviceType, appVersion: '1.0.0' });
    const genKey = async (deviceType: string) => {
      const res = await auth(request(app.getHttpServer()).post('/api/v1/activation-keys')).send({ restaurantId, allowedDeviceType: deviceType, expiresAt: inDays(1) });
      return res.body.code as string;
    };

    // The KIOSK plan's cap is 2 — fill it.
    for (let i = 0; i < 2; i++) {
      const key = await genKey('KIOSK');
      const res = await redeem(key, 'KIOSK');
      expect(res.status).toBe(201);
    }
    // A 3rd KIOSK device is rejected — the KIOSK plan's own cap (2) is reached.
    const thirdKioskKey = await genKey('KIOSK');
    const thirdKiosk = await redeem(thirdKioskKey, 'KIOSK');
    expect(thirdKiosk.status).toBe(409);

    // POS is governed by the separate RESTAURANT plan's cap of 3, and is unaffected by KIOSK
    // being full — proving quotas are per-app, not one shared pool across every subscription.
    const posKey = await genKey('POS');
    const posRes = await redeem(posKey, 'POS');
    expect(posRes.status).toBe(201);
  });
});
