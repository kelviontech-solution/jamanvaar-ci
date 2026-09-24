import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * BUG-003: "Extend Trial (+30 Days)" called PATCH /subscriptions/:id, a route that
 * does not exist ("Cannot PATCH"). Extending is now a real endpoint that adds days to
 * the later of the current expiry and today, without silently reactivating a
 * suspended subscription.
 */
describe('Extend a subscription (BUG-003)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-extend-${Date.now()}@example.com`;
  const password = 'correct-horse-battery-staple';
  let token: string;
  let restaurantId: string;
  let planId: string;
  let subId: string;

  const api = (method: 'get' | 'post' | 'patch', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  const day = 86400000;
  const setSub = (data: object) => prisma.runAsPlatform((tx) => tx.subscription.update({ where: { id: subId }, data }));
  const getSub = () => prisma.runAsPlatform((tx) => tx.subscription.findUniqueOrThrow({ where: { id: subId } }));

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password });
    token = (await platformLogin(app, adminEmail, password)).body.accessToken;
    const rest = await api('post', '/api/v1/restaurants').send({ name: `TEST Extend ${Date.now()}`, ownerName: 'Ext Owner', ownerEmail: `ext-owner-${Date.now()}@test.example.com` });
    restaurantId = rest.body.restaurant.id;
    const plan = await api('post', '/api/v1/plans').send({ tier: 'PRO', name: `TEST Extend Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { pos: true } });
    planId = plan.body.id;
    const sub = await api('post', '/api/v1/subscriptions').send({ restaurantId, planId, status: 'TRIAL', expiresAt: new Date(Date.now() + 10 * day).toISOString() });
    subId = sub.body.id;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('adds the days to the current expiry when it is still in the future, and keeps the status', async () => {
    const before = await getSub();
    const res = await api('patch', `/api/v1/subscriptions/${subId}/extend`).send({ days: 30 });
    expect(res.status).toBe(200);
    const after = await getSub();
    expect(after.expiresAt.getTime()).toBe(before.expiresAt.getTime() + 30 * day);
    expect(after.status).toBe('TRIAL');
    expect(new Date(res.body.expiresAt).getTime()).toBe(after.expiresAt.getTime());
  });

  it('counts from today when the subscription has already lapsed, and revives it', async () => {
    await setSub({ status: 'EXPIRED', expiresAt: new Date(Date.now() - 20 * day) });
    const res = await api('patch', `/api/v1/subscriptions/${subId}/extend`).send({ days: 30 });
    expect(res.status).toBe(200);
    const after = await getSub();
    const expected = Date.now() + 30 * day;
    expect(Math.abs(after.expiresAt.getTime() - expected)).toBeLessThan(60_000);
    expect(after.status).not.toBe('EXPIRED');
  });

  it('does not silently reactivate a suspended subscription', async () => {
    await setSub({ status: 'SUSPENDED', expiresAt: new Date(Date.now() + 5 * day) });
    const before = await getSub();
    const res = await api('patch', `/api/v1/subscriptions/${subId}/extend`).send({ days: 30 });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/reactivate/i);
    expect((await getSub()).expiresAt.getTime()).toBe(before.expiresAt.getTime());
  });

  it('rejects a silly number of days and an unknown subscription', async () => {
    await setSub({ status: 'ACTIVE', expiresAt: new Date(Date.now() + 5 * day) });
    for (const days of [0, -3, 366, 1.5, 'lots']) {
      expect((await api('patch', `/api/v1/subscriptions/${subId}/extend`).send({ days })).status, String(days)).toBe(400);
    }
    expect((await api('patch', '/api/v1/subscriptions/does-not-exist/extend').send({ days: 30 })).status).toBe(404);
  });

  it('is recorded in the audit trail', async () => {
    await api('patch', `/api/v1/subscriptions/${subId}/extend`).send({ days: 7 });
    const log = await prisma.auditLog.findFirst({ where: { action: 'SUBSCRIPTION_EXTENDED', restaurantId }, orderBy: { createdAt: 'desc' } });
    expect(log).toBeTruthy();
    expect((log!.details as any).days).toBe(7);
  });
});
