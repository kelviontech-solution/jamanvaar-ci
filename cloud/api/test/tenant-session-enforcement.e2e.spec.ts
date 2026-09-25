import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * BUG-089: a Restaurant Admin session (access + 30-day refresh token) used to
 * keep working after the restaurant was suspended or the Restaurant Admin
 * device was revoked, because the tenant guard and the refresh only looked at
 * the user. Sessions now re-check the restaurant, its subscription and the
 * device the session was created on.
 */
describe('Restaurant Admin session enforcement (BUG-089)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-tenant-enf-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  const ownerEmail = `tenant-enf-owner-${Date.now()}@test.example.com`;
  const ownerPassword = 'owner-password-long-enough';
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  let deviceId: string;
  let deviceToken: string;
  let accessToken: string;
  let refreshToken: string;

  const platform = (method: 'get' | 'post' | 'patch', url: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${platformToken}`);
  const tenant = (url: string) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${accessToken}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    const login = await platformLogin(app, adminEmail, adminPassword);
    platformToken = login.body.accessToken;

    const rest = await platform('post', '/api/v1/restaurants').send({ name: `TEST Tenant Enf ${Date.now()}`, ownerName: 'Enf Owner', ownerEmail });
    restaurantId = rest.body.restaurant.id;
    await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/set-initial-password')
      .send({ restaurantId, email: ownerEmail, activationToken: rest.body.activationToken, newPassword: ownerPassword });

    const plan = await platform('post', '/api/v1/plans').send({
      tier: 'PRO', name: `TEST Tenant Enf Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { posTerminal: true }
    });
    planId = plan.body.id;
    await platform('post', '/api/v1/subscriptions').send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });

    const key = await platform('post', '/api/v1/activation-keys').send({ restaurantId, allowedDeviceType: 'POS_ADMIN', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const redeem = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: 'POS_ADMIN' });
    deviceId = redeem.body.device.id;
    deviceToken = redeem.body.deviceToken;

    const session = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ email: ownerEmail, password: ownerPassword, restaurantId, deviceId, deviceToken, deviceType: 'POS_ADMIN', returnRefreshToken: true });
    accessToken = session.body.accessToken;
    refreshToken = session.body.refreshToken;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('an owner session on an activated Restaurant Admin device works', async () => {
    expect(accessToken).toBeTruthy();
    expect((await tenant('/api/v1/tenant/me')).status).toBe(200);
  });

  it('suspending the restaurant stops the existing session and its refresh, and reactivating restores them', async () => {
    await platform('patch', `/api/v1/restaurants/${restaurantId}/suspend`);

    const blocked = await tenant('/api/v1/tenant/me');
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('RESTAURANT_SUSPENDED');

    const refresh = await request(app.getHttpServer()).post('/api/v1/tenant-auth/refresh').send({ refreshToken });
    expect(refresh.status).toBe(403);

    await platform('patch', `/api/v1/restaurants/${restaurantId}/reactivate`);
    expect((await tenant('/api/v1/tenant/me')).status).toBe(200);
  });

  it('revoking the Restaurant Admin device ends the session and its refresh token', async () => {
    const revoke = await platform('patch', `/api/v1/devices/${deviceId}/revoke`);
    expect(revoke.status).toBe(200);

    const blocked = await tenant('/api/v1/tenant/me');
    expect(blocked.status).toBe(401);
    expect(blocked.body.code).toBe('DEVICE_REVOKED');

    const refresh = await request(app.getHttpServer()).post('/api/v1/tenant-auth/refresh').send({ refreshToken });
    expect(refresh.status).toBe(401);
  });
});
