import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Plan product family (Phase 2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  const stamp = Date.now();
  const adminEmail = `test-planfam-admin-${stamp}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  const createdPlanIds: string[] = [];
  const createdRestaurantIds: string[] = [];
  let restaurantId: string;

  const authed = (method: 'get' | 'post' | 'patch', url: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${accessToken}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    accessToken = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;

    const restaurant = await authed('post', '/api/v1/restaurants').send({
      name: `TEST PlanFam Restaurant ${stamp}`, mobile: `6${String(stamp).slice(-9)}`, ownerName: 'Owner', ownerEmail: `planfam-${stamp}@example.com`
    });
    restaurantId = restaurant.body.restaurant.id;
    createdRestaurantIds.push(restaurantId);
  });

  afterAll(async () => {
    if (createdRestaurantIds.length) await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } }));
    if (createdPlanIds.length) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: { in: createdPlanIds } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('defaults a new plan to the RESTAURANT product family', async () => {
    const res = await authed('post', '/api/v1/plans').send({
      tier: 'CORE', name: `TEST Family Default ${Date.now()}`, priceMonthly: 100000, maxBranches: 1, maxDevices: 5, maxUsers: 5, entitlements: {}
    });
    expect(res.status).toBe(201);
    expect(res.body.productFamily).toBe('RESTAURANT');
    createdPlanIds.push(res.body.id);
  });

  it('accepts an explicit KIOSK product family', async () => {
    const res = await authed('post', '/api/v1/plans').send({
      tier: 'CORE', name: `TEST Family Kiosk ${Date.now()}`, productFamily: 'KIOSK', priceMonthly: 100000, maxBranches: 1, maxDevices: 5, maxUsers: 5, entitlements: {}
    });
    expect(res.status).toBe(201);
    expect(res.body.productFamily).toBe('KIOSK');
    createdPlanIds.push(res.body.id);
  });

  it('accepts the QR tier', async () => {
    const res = await authed('post', '/api/v1/plans').send({
      tier: 'QR', name: `TEST Family QR Tier ${Date.now()}`, priceMonthly: 100000, maxBranches: 1, maxDevices: 5, maxUsers: 5, entitlements: {}
    });
    expect(res.status).toBe(201);
    expect(res.body.tier).toBe('QR');
    createdPlanIds.push(res.body.id);
  });

  it('rejects an activation key allowedDeviceType of QR_ORDERING (it has no physical device)', async () => {
    const res = await authed('post', '/api/v1/activation-keys').send({
      restaurantId, allowedDeviceType: 'QR_ORDERING', expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    expect(res.status).toBe(400);
  });
});
