import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Annual billing cadence (Phase 5)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const stamp = Date.now();
  const adminEmail = `test-annualbill-${stamp}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  const createdRestaurantIds: string[] = [];
  const createdPlanIds: string[] = [];

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    token = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;
  });

  afterAll(async () => {
    if (createdRestaurantIds.length) await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } }));
    if (createdPlanIds.length) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: { in: createdPlanIds } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('bills the annual price over a ~365-day period for a plan with priceYearly set', async () => {
    const restaurant = await auth(request(app.getHttpServer()).post('/api/v1/restaurants')).send({
      name: `TEST Annual Bill ${stamp}`, mobile: `6${String(stamp).slice(-9)}`, ownerName: 'Owner', ownerEmail: `annualbill-${stamp}@example.com`
    });
    createdRestaurantIds.push(restaurant.body.restaurant.id);

    const plan = await auth(request(app.getHttpServer()).post('/api/v1/plans')).send({
      tier: 'CORE', name: `TEST Annual Plan ${stamp}`, priceMonthly: 42000, priceYearly: 500000, maxBranches: 1, maxDevices: 5, maxUsers: 10, entitlements: {}
    });
    createdPlanIds.push(plan.body.id);

    const sub = await auth(request(app.getHttpServer()).post('/api/v1/subscriptions')).send({
      restaurantId: restaurant.body.restaurant.id, planId: plan.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 365 * 86400000).toISOString()
    });
    expect(sub.status).toBe(201);

    const invoiceList = await auth(request(app.getHttpServer()).get(`/api/v1/invoices?restaurantId=${restaurant.body.restaurant.id}`));
    expect(invoiceList.body[0].amount).toBe(500000);
    const periodDays = (new Date(invoiceList.body[0].billingPeriodEnd).getTime() - new Date(invoiceList.body[0].billingPeriodStart).getTime()) / 86400000;
    expect(periodDays).toBeGreaterThan(360);
    expect(periodDays).toBeLessThan(370);
  });

  it('keeps the old 30-day/priceMonthly cadence for a plan with no priceYearly set', async () => {
    const restaurant = await auth(request(app.getHttpServer()).post('/api/v1/restaurants')).send({
      name: `TEST Monthly Bill ${stamp}`, mobile: `6${String(stamp + 1).slice(-9)}`, ownerName: 'Owner', ownerEmail: `monthlybill-${stamp}@example.com`
    });
    createdRestaurantIds.push(restaurant.body.restaurant.id);

    const plan = await auth(request(app.getHttpServer()).post('/api/v1/plans')).send({
      tier: 'CORE', name: `TEST Monthly Plan ${stamp}`, priceMonthly: 500000, maxBranches: 1, maxDevices: 5, maxUsers: 10, entitlements: {}
    });
    createdPlanIds.push(plan.body.id);

    const sub = await auth(request(app.getHttpServer()).post('/api/v1/subscriptions')).send({
      restaurantId: restaurant.body.restaurant.id, planId: plan.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString()
    });
    expect(sub.status).toBe(201);

    const invoiceList = await auth(request(app.getHttpServer()).get(`/api/v1/invoices?restaurantId=${restaurant.body.restaurant.id}`));
    expect(invoiceList.body[0].amount).toBe(500000);
    const periodDays = (new Date(invoiceList.body[0].billingPeriodEnd).getTime() - new Date(invoiceList.body[0].billingPeriodStart).getTime()) / 86400000;
    expect(periodDays).toBeGreaterThan(28);
    expect(periodDays).toBeLessThan(32);
  });
});
