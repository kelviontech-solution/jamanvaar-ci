import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { generateOpaqueToken, hashOpaqueToken } from '../src/common/security/token.util';

describe('Merged Restaurant Admin access after kiosk-key activation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let platformToken: string;
  const email = `test-merged-admin-${Date.now()}@example.com`;
  const password = 'merged-admin-test-password';
  const restaurantIds: string[] = [];
  const planIds: string[] = [];
  const platform = (method: 'post' | 'patch', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${platformToken}`);
  const device = (method: 'get' | 'patch', url: string, token: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email, password });
    platformToken = (await platformLogin(app, email, password)).body.accessToken;
  });
  afterAll(async () => {
    for (const id of restaurantIds) await prisma.runAsPlatform(tx => tx.restaurant.deleteMany({ where: { id } }));
    for (const id of planIds) await prisma.runAsPlatform(tx => tx.plan.deleteMany({ where: { id } }));
    await prisma.platformUser.deleteMany({ where: { email } });
    await app.close();
  });

  async function fixture(applications: string[]) {
    const ownerEmail = `merged-owner-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const created = await platform('post', '/api/v1/restaurants').send({ name: 'TEST Merged Admin', ownerName: 'Merged Owner', ownerEmail });
    expect(created.status).toBe(201);
    const restaurantId = created.body.restaurant.id as string;
    restaurantIds.push(restaurantId);
    expect((await request(app.getHttpServer()).post('/api/v1/tenant-auth/set-initial-password').send({
      restaurantId, email: ownerEmail, activationToken: created.body.activationToken, newPassword: password
    })).status).toBe(200);
    const plan = await platform('post', '/api/v1/plans').send({
      name: `TEST Merged Plan ${restaurantId}`, tier: 'PRO', productFamily: applications.includes('POS') ? 'RESTAURANT' : 'KIOSK',
      priceMonthly: 100000, maxBranches: 1, maxDevices: 5, maxUsers: 5, entitlements: {}
    });
    expect(plan.status).toBe(201);
    planIds.push(plan.body.id);
    const subscription = await platform('post', '/api/v1/subscriptions').send({
      restaurantId, planId: plan.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 86400000).toISOString(), applications
    });
    expect(subscription.status).toBe(201);
    const keyType = applications.includes('KIOSK_ADMIN') ? 'KIOSK_ADMIN' : applications.includes('POS_ADMIN') ? 'POS_ADMIN' : 'ANY';
    const key = await platform('post', '/api/v1/activation-keys').send({ restaurantId, allowedDeviceType: keyType, expiresAt: new Date(Date.now() + 86400000).toISOString() });
    expect(key.status).toBe(201);
    async function activate(code = key.body.code) {
      const login = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantId, password, deviceType: 'POS_ADMIN' });
      expect(login.status).toBe(200);
      expect(login.body.requiresActivation).toBe(true);
      return request(app.getHttpServer()).post('/api/v1/tenant-auth/activate-device').send({
        activationSessionToken: login.body.activationSessionToken, activationKey: code, deviceType: 'POS_ADMIN'
      });
    }
    return { restaurantId, subscriptionId: subscription.body.id as string, keyId: key.body.id as string, activate };
  }

  it.each([
    { label: 'kiosk-only', applications: ['KIOSK', 'KIOSK_ADMIN'] },
    { label: 'restaurant-only', applications: ['POS', 'POS_ADMIN'] },
    { label: 'both families', applications: ['POS', 'POS_ADMIN', 'KIOSK', 'KIOSK_ADMIN'] }
  ])('$label: activation is followed by working heartbeat and console APIs', async ({ applications }) => {
    const f = await fixture(applications);
    const activated = await f.activate();
    expect(activated.status).toBe(200);
    const token = activated.body.deviceToken;
    const row = await prisma.runAsPlatform(tx => tx.device.findUniqueOrThrow({ where: { id: activated.body.deviceId } }));
    expect(row.type).toBe('POS_ADMIN');
    expect((await device('patch', '/api/v1/devices/me/heartbeat', token).send({})).status).toBe(200);
    expect((await device('get', '/api/v1/devices/me/fleet', token)).status).toBe(200);
    expect((await device('get', '/api/v1/orders/sync', token)).status).toBe(200);
    const modules = await request(app.getHttpServer()).get('/api/v1/tenant/me/applications').set('Authorization', `Bearer ${activated.body.accessToken}`);
    expect(modules.status).toBe(200);
    expect(modules.body.enabledApps.sort()).toEqual(applications.sort());
  });

  it('requires acknowledgement before disabling the last kiosk-console entitlement, then locks and restores access', async () => {
    const f = await fixture(['KIOSK', 'KIOSK_ADMIN']);
    const activated = await f.activate();
    expect(activated.status).toBe(200);
    const token = activated.body.deviceToken;
    expect((await device('get', '/api/v1/orders/sync', token)).status).toBe(200);
    const path = `/api/v1/subscriptions/${f.subscriptionId}/applications/KIOSK_ADMIN`;
    expect((await platform('patch', path).send({ enabled: false })).status).toBe(409);
    expect((await platform('patch', path).send({ enabled: false, acknowledgeDeviceImpact: true })).status).toBe(200);
    const denied = await device('get', '/api/v1/orders/sync', token);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('APP_DISABLED');
    expect((await platform('patch', path).send({ enabled: true })).status).toBe(200);
    expect((await device('get', '/api/v1/orders/sync', token)).status).toBe(200);
  });

  it('counts a merged POS_ADMIN console against a kiosk-only admin quota and leaves a refused key unused', async () => {
    const f = await fixture(['KIOSK', 'KIOSK_ADMIN']);
    expect((await platform('patch', `/api/v1/subscriptions/${f.subscriptionId}/applications/KIOSK_ADMIN`).send({ deviceQuota: 1 })).status).toBe(200);
    expect((await f.activate()).status).toBe(200);
    const nextKey = await platform('post', '/api/v1/activation-keys').send({ restaurantId: f.restaurantId, allowedDeviceType: 'KIOSK_ADMIN', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    expect(nextKey.status).toBe(201);
    expect((await f.activate(nextKey.body.code)).status).toBe(409);
    const key = await prisma.runAsPlatform(tx => tx.activationKey.findUniqueOrThrow({ where: { id: nextKey.body.id } }));
    expect(key.status).toBe('ACTIVE');
    expect(await prisma.runAsPlatform(tx => tx.device.count({ where: { restaurantId: f.restaurantId, type: 'POS_ADMIN' } }))).toBe(1);
  });

  it('denies activation when neither admin entitlement is enabled', async () => {
    const f = await fixture([]);
    expect((await f.activate()).status).toBe(403);
    expect((await prisma.runAsPlatform(tx => tx.activationKey.findUniqueOrThrow({ where: { id: f.keyId } }))).status).toBe('ACTIVE');
  });

  it('does not let a disabled POS terminal inherit the merged console entitlement', async () => {
    const f = await fixture(['KIOSK', 'KIOSK_ADMIN']);
    const token = generateOpaqueToken();
    await prisma.runAsPlatform(tx => tx.device.create({ data: { restaurantId: f.restaurantId, type: 'POS', status: 'ACTIVE', deviceTokenHash: hashOpaqueToken(token) } }));
    const denied = await device('get', '/api/v1/orders/sync', token);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('APP_DISABLED');
  });

  it('still denies an expired subscription after valid kiosk-console activation', async () => {
    const f = await fixture(['KIOSK', 'KIOSK_ADMIN']);
    const activated = await f.activate();
    expect(activated.status).toBe(200);
    await prisma.runAsPlatform(tx => tx.subscription.update({ where: { id: f.subscriptionId }, data: { expiresAt: new Date(Date.now() - 1000) } }));
    const denied = await device('get', '/api/v1/orders/sync', activated.body.deviceToken);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('SUBSCRIPTION_INACTIVE');
  });
});
