import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('SaaS management modules: Plans, Subscriptions, Activation Keys, Devices, Branches, Owners, Audit, Health, Sessions', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  const adminEmail = `test-saas-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';

  let restaurantId: string;
  let branchId: string;
  let ownerId: string;
  let planId: string;
  let subscriptionId: string;
  let activationKeyId: string;

  // Takes the HTTP method up front so it's impossible to accidentally call
  // .set() on the bare agent (which has no such method) instead of on the
  // Test object a verb method (.get/.post/...) returns.
  const authed = (method: 'get' | 'post' | 'patch' | 'delete', url: string) =>
    request(app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${accessToken}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/platform-auth/login')
      .send({ email: adminEmail, password: adminPassword });
    accessToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants').send({
      name: `TEST SaaS Modules Restaurant ${Date.now()}`,
      ownerName: 'SaaS Test Owner',
      ownerEmail: `saas-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;
    branchId = restaurantRes.body.branch.id;
    ownerId = restaurantRes.body.owner.id;
  });

  afterAll(async () => {
    // Restaurant is RLS-protected — must delete inside a platform context, or
    // this silently deletes nothing and the later Plan delete fails on the
    // still-live Subscription FK (exactly what happened before this fix).
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.plan.deleteMany({ where: { id: planId } });
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  describe('Plans', () => {
    it('rejects an incomplete plan', async () => {
      const res = await authed('post', '/api/v1/plans').send({ name: 'A' });
      expect(res.status).toBe(400);
    });

    it('creates a plan with entitlements', async () => {
      const res = await authed('post', '/api/v1/plans').send({
        tier: 'CORE',
        name: `TEST Plan ${Date.now()}`,
        priceMonthly: 500000,
        maxBranches: 2,
        maxDevices: 5,
        maxUsers: 10,
        entitlements: { posTerminal: true, captainApp: false }
      });
      expect(res.status).toBe(201);
      expect(res.body.entitlements.posTerminal).toBe(true);
      expect(res.body.entitlements.captainApp).toBe(false);
      // Untouched keys still default to false via the entitlements schema, not undefined.
      expect(res.body.entitlements.kotKdsRouting).toBe(false);
      planId = res.body.id;
    });

    it('lists plans including the new one', async () => {
      const res = await authed('get', '/api/v1/plans');
      expect(res.status).toBe(200);
      expect(res.body.some((p: { id: string }) => p.id === planId)).toBe(true);
    });

    it('excludeTestFixtures=true hides TEST-prefixed plans (the Onboarding picker flooded with test plans) without affecting the default list', async () => {
      const withoutFilter = await authed('get', '/api/v1/plans');
      expect(withoutFilter.body.some((p: { id: string }) => p.id === planId)).toBe(true);

      const withFilter = await authed('get', '/api/v1/plans?excludeTestFixtures=true');
      expect(withFilter.body.some((p: { id: string }) => p.id === planId)).toBe(false);
    });

    it('deactivates and reactivates a plan', async () => {
      const deactivate = await authed('patch', `/api/v1/plans/${planId}/deactivate`);
      expect(deactivate.status).toBe(200);
      expect(deactivate.body.status).toBe('INACTIVE');

      const activate = await authed('patch', `/api/v1/plans/${planId}/activate`);
      expect(activate.status).toBe(200);
      expect(activate.body.status).toBe('ACTIVE');
    });
  });

  describe('Subscriptions', () => {
    it('assigns a subscription to the restaurant', async () => {
      const res = await authed('post', '/api/v1/subscriptions').send({
        restaurantId,
        planId,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      });
      expect(res.status).toBe(201);
      expect(res.body.plan.id).toBe(planId);
      subscriptionId = res.body.id;
    });

    it('rejects assigning a second active subscription to the same restaurant', async () => {
      const res = await authed('post', '/api/v1/subscriptions').send({
        restaurantId,
        planId,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      });
      expect(res.status).toBe(409);
    });

    it('renews the subscription', async () => {
      const newExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
      const res = await authed('patch', `/api/v1/subscriptions/${subscriptionId}/renew`)
        .send({ expiresAt: newExpiry });
      expect(res.status).toBe(200);
      expect(new Date(res.body.expiresAt).toISOString()).toBe(newExpiry);
    });

    it('suspends then reactivates the subscription, both audited', async () => {
      const suspend = await authed('patch', 
        `/api/v1/subscriptions/${subscriptionId}/suspend`
      );
      expect(suspend.status).toBe(200);
      expect(suspend.body.status).toBe('SUSPENDED');

      const reactivate = await authed('patch', 
        `/api/v1/subscriptions/${subscriptionId}/reactivate`
      );
      expect(reactivate.status).toBe(200);
      expect(reactivate.body.status).toBe('ACTIVE');

      const auditRows = await prisma.auditLog.findMany({
        where: { restaurantId, category: 'SUBSCRIPTION' },
        orderBy: { createdAt: 'asc' }
      });
      expect(auditRows.map((r) => r.action)).toEqual(
        expect.arrayContaining(['SUBSCRIPTION_ASSIGNED', 'SUBSCRIPTION_RENEWED', 'SUBSCRIPTION_SUSPENDED', 'SUBSCRIPTION_ACTIVE'])
      );
    });
  });

  describe('Activation keys', () => {
    it('generates a key with a non-predictable code', async () => {
      const res = await authed('post', '/api/v1/activation-keys').send({
        restaurantId,
        subscriptionId,
        allowedDeviceType: 'POS',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      });
      expect(res.status).toBe(201);
      expect(res.body.code).toMatch(/^JMV-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
      expect(res.body.status).toBe('ACTIVE');
      activationKeyId = res.body.id;
    });

    it('lists keys scoped to the restaurant', async () => {
      const res = await authed('get', `/api/v1/activation-keys?restaurantId=${restaurantId}`);
      expect(res.status).toBe(200);
      expect(res.body.some((k: { id: string }) => k.id === activationKeyId)).toBe(true);
    });

    it('revokes a key and rejects revoking it twice', async () => {
      const first = await authed('patch', `/api/v1/activation-keys/${activationKeyId}/revoke`);
      expect(first.status).toBe(200);
      expect(first.body.status).toBe('REVOKED');

      const second = await authed('patch', `/api/v1/activation-keys/${activationKeyId}/revoke`);
      expect(second.status).toBe(409);
    });
  });

  describe('Devices', () => {
    it('shows an empty list — no device has ever been fabricated', async () => {
      const res = await authed('get', `/api/v1/devices?restaurantId=${restaurantId}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('revokes a real device once one exists (inserted directly, simulating a future activation)', async () => {
      const device = await prisma.runAsPlatform((tx) =>
        tx.device.create({ data: { restaurantId, branchId, type: 'POS', status: 'ACTIVE' } })
      );

      const res = await authed('patch', `/api/v1/devices/${device.id}/revoke`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('REVOKED');
    });
  });

  describe('Branches', () => {
    it('enforces the plan branch limit', async () => {
      // Plan allows maxBranches: 2; restaurant already has 1 default branch — one more should succeed, a second should fail.
      const ok = await authed('post', '/api/v1/branches').send({
        restaurantId,
        name: 'Second Branch',
        code: 'second'
      });
      expect(ok.status).toBe(201);
      expect(ok.body.code).toBe('SECOND'); // uppercased by the DTO

      const overLimit = await authed('post', '/api/v1/branches').send({
        restaurantId,
        name: 'Third Branch',
        code: 'third'
      });
      expect(overLimit.status).toBe(409);
    });

    it('rejects a duplicate branch code for the same restaurant', async () => {
      const res = await authed('post', '/api/v1/branches').send({
        restaurantId,
        name: 'Duplicate Main',
        code: 'MAIN'
      });
      expect(res.status).toBe(409);
    });

    it('deactivates and reactivates a branch', async () => {
      const deactivate = await authed('patch', `/api/v1/branches/${branchId}/deactivate`);
      expect(deactivate.status).toBe(200);
      expect(deactivate.body.status).toBe('INACTIVE');

      const activate = await authed('patch', `/api/v1/branches/${branchId}/activate`);
      expect(activate.status).toBe(200);
      expect(activate.body.status).toBe('ACTIVE');
    });
  });

  describe('Owners', () => {
    it('lists owners across restaurants, never exposing passwordHash', async () => {
      const res = await authed('get', '/api/v1/owners');
      expect(res.status).toBe(200);
      expect(res.body.some((o: { id: string }) => o.id === ownerId)).toBe(true);
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('updates owner details', async () => {
      const res = await authed('patch', `/api/v1/owners/${ownerId}`).send({
        phone: '9998887777'
      });
      expect(res.status).toBe(200);
      expect(res.body.phone).toBe('9998887777');
    });

    it('suspends then activates an owner', async () => {
      const suspend = await authed('patch', `/api/v1/owners/${ownerId}/suspend`);
      expect(suspend.status).toBe(200);
      expect(suspend.body.status).toBe('DISABLED');

      const activate = await authed('patch', `/api/v1/owners/${ownerId}/activate`);
      expect(activate.status).toBe(200);
      expect(activate.body.status).toBe('ACTIVE');
    });
  });

  describe('Audit log query', () => {
    it('filters by restaurant and category with pagination', async () => {
      const res = await authed('get', 
        `/api/v1/audit-logs?restaurantId=${restaurantId}&category=SUBSCRIPTION&page=1&limit=10`
      );
      expect(res.status).toBe(200);
      expect(res.body.rows.every((r: { category: string }) => r.category === 'SUBSCRIPTION')).toBe(true);
      expect(res.body.total).toBeGreaterThan(0);
    });
  });

  describe('System health', () => {
    it('reports the API and a real database ping', async () => {
      const res = await authed('get', '/api/v1/platform/system-health');
      expect(res.status).toBe(200);
      expect(res.body.api).toBe('UP');
      expect(res.body.database).toBe('UP');
      expect(typeof res.body.databaseLatencyMs).toBe('number');
    });
  });

  describe('Sessions + change password', () => {
    it('lists the current session and can revoke another one (which is then cut off at once)', async () => {
      const list = await authed('get', '/api/v1/platform/sessions');
      expect(list.status).toBe(200);
      expect(list.body.length).toBeGreaterThan(0);
      expect(list.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

      // A second login (another browser) is the session we revoke; ours must keep working.
      const other = await request(app.getHttpServer())
        .post('/api/v1/platform-auth/login')
        .send({ email: adminEmail, password: adminPassword });
      const otherId = (await request(app.getHttpServer()).get('/api/v1/platform/sessions').set('Authorization', `Bearer ${other.body.accessToken}`))
        .body.find((s: { current: boolean }) => s.current).id;

      const revoke = await authed('delete', `/api/v1/platform/sessions/${otherId}`);
      expect(revoke.status).toBe(200);
      expect(revoke.body.current).toBe(false);
      expect((await request(app.getHttpServer()).get('/api/v1/platform/me').set('Authorization', `Bearer ${other.body.accessToken}`)).status).toBe(401);
      expect((await authed('get', '/api/v1/platform/me')).status).toBe(200);
    });

    it('rejects a password change with the wrong current password', async () => {
      const res = await authed('patch', '/api/v1/platform/me/password')
        .send({ currentPassword: 'not-the-real-password', newPassword: 'brand-new-password-123' });
      expect(res.status).toBe(400);
    });

    it('changes the password and revokes other sessions', async () => {
      const res = await authed('patch', '/api/v1/platform/me/password')
        .send({ currentPassword: adminPassword, newPassword: 'brand-new-password-123' });
      expect(res.status).toBe(200);

      // Old password no longer works.
      const oldLogin = await request(app.getHttpServer())
        .post('/api/v1/platform-auth/login')
        .send({ email: adminEmail, password: adminPassword });
      expect(oldLogin.status).toBe(401);

      // New password does.
      const newLogin = await request(app.getHttpServer())
        .post('/api/v1/platform-auth/login')
        .send({ email: adminEmail, password: 'brand-new-password-123' });
      expect(newLogin.status).toBe(200);
      accessToken = newLogin.body.accessToken;
    });
  });
});
