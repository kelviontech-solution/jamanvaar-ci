import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * pos-admin (Restaurant Admin) needs to know which AppCodes its own restaurant has enabled,
 * to gate its own nav sections (e.g. the Kiosk Terminals tab behind KIOSK_ADMIN) — the only
 * endpoints reading ApplicationEntitlement rows before this were Super-Admin-scoped
 * (GET /api/v1/restaurants/:id/applications), unusable from a tenant session. This is the
 * tenant-scoped equivalent, mirroring the existing GET /api/v1/tenant/me/entitlements pattern.
 */
describe('Tenant: GET /api/v1/tenant/me/applications', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-myapps-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let ownerToken: string;
  let subscriptionId: string;

  const authed = (method: 'get' | 'post' | 'patch', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    platformToken = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;

    const ownerEmail = `myapps-owner-${Date.now()}@test.example.com`;
    const ownerPassword = 'owner-correct-horse-battery';
    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST MyApps Restaurant ${Date.now()}`,
      ownerName: 'MyApps Owner',
      ownerEmail
    });
    restaurantId = restaurantRes.body.restaurant.id;
    const activationToken = restaurantRes.body.activationToken;

    await request(app.getHttpServer()).post('/api/v1/tenant-auth/set-initial-password').send({
      restaurantId, email: ownerEmail, activationToken, newPassword: ownerPassword
    });
    const ownerLoginRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: ownerEmail, password: ownerPassword });
    ownerToken = ownerLoginRes.body.accessToken;

    const plan = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'CORE',
      name: `TEST MyApps Plan ${Date.now()}`,
      priceMonthly: 100000,
      maxBranches: 1,
      maxDevices: 5,
      maxUsers: 10,
      entitlements: { posTerminal: true }
    });
    const sub = await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId,
      planId: plan.body.id,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString()
    });
    subscriptionId = sub.body.id;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('does not include KIOSK_ADMIN before Super Admin enables it for this restaurant', async () => {
    const res = await authed('get', '/api/v1/tenant/me/applications', ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.enabledApps).not.toContain('KIOSK_ADMIN');
  });

  it('includes KIOSK_ADMIN once Super Admin enables it for this restaurant', async () => {
    const patchRes = await authed('patch', `/api/v1/subscriptions/${subscriptionId}/applications/KIOSK_ADMIN`, platformToken).send({
      enabled: true
    });
    expect(patchRes.status).toBe(200);

    const res = await authed('get', '/api/v1/tenant/me/applications', ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.enabledApps).toContain('KIOSK_ADMIN');
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/tenant/me/applications');
    expect(res.status).toBe(401);
  });
});
