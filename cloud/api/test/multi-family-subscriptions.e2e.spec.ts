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
      restaurantId, planId: restaurantPlanId, status: 'ACTIVE', expiresAt: inDays(365)
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
});
