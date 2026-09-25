import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * BUG-049 / BUG-059 / BUG-068: disabling an app, locking a device, revoking a
 * device (or the key it used) must actually stop that terminal at the server,
 * with a machine-readable reason the terminal can show on a lock screen.
 * Before: only the device's own status, the restaurant status and the
 * subscription were checked, so none of these had any effect.
 */
describe('Device enforcement (BUG-049/059/068)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-device-enf-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  let subscriptionId: string;
  let posToken: string;
  let posDeviceId: string;
  let posKeyId: string;
  let kdsToken: string;

  const platform = (method: 'get' | 'post' | 'patch', url: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${platformToken}`);
  const device = (method: 'get' | 'post' | 'patch', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  async function enroll(type: string) {
    const key = await platform('post', '/api/v1/activation-keys').send({ restaurantId, allowedDeviceType: type, expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const redeem = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: type });
    return { token: redeem.body.deviceToken as string, deviceId: redeem.body.device.id as string, keyId: key.body.id as string };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    const login = await platformLogin(app, adminEmail, adminPassword);
    platformToken = login.body.accessToken;

    const rest = await platform('post', '/api/v1/restaurants').send({
      name: `TEST Device Enforcement ${Date.now()}`, ownerName: 'Enf Owner', ownerEmail: `enf-owner-${Date.now()}@test.example.com`
    });
    restaurantId = rest.body.restaurant.id;
    const plan = await platform('post', '/api/v1/plans').send({
      tier: 'PRO', name: `TEST Enf Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { pos: true, kds: true }
    });
    planId = plan.body.id;
    const sub = await platform('post', '/api/v1/subscriptions').send({
      restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      // Phase 6 added a POS_ADMIN-requires-POS dependency check — this suite disables POS
      // directly and asserts KDS is unaffected, so it excludes POS_ADMIN (which it never
      // exercises) to keep that assertion valid without touching the dependency graph.
      applications: ['POS', 'KDS']
    });
    subscriptionId = sub.body.id;

    const pos = await enroll('POS');
    posToken = pos.token; posDeviceId = pos.deviceId; posKeyId = pos.keyId;
    kdsToken = (await enroll('KDS')).token;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('an enrolled terminal works', async () => {
    expect((await device('get', '/api/v1/orders/sync', posToken)).status).toBe(200);
  });

  it('disabling the POS application stops POS terminals only, with an APP_DISABLED reason', async () => {
    const off = await platform('patch', `/api/v1/subscriptions/${subscriptionId}/applications/POS`).send({ enabled: false });
    expect(off.status).toBe(200);

    const blocked = await device('get', '/api/v1/orders/sync', posToken);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('APP_DISABLED');

    expect((await device('get', '/api/v1/orders/sync', kdsToken)).status).toBe(200); // KDS unaffected

    await platform('patch', `/api/v1/subscriptions/${subscriptionId}/applications/POS`).send({ enabled: true });
    expect((await device('get', '/api/v1/orders/sync', posToken)).status).toBe(200);
  });

  it('locking a device blocks its data calls with DEVICE_LOCKED but still lets it check in and fetch commands', async () => {
    const lock = await platform('post', `/api/v1/devices/${posDeviceId}/lock`).send({ reason: 'Stolen terminal' });
    expect(lock.status).toBe(201);

    const blocked = await device('get', '/api/v1/orders/sync', posToken);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('DEVICE_LOCKED');
    expect(blocked.body.reason).toBe('Stolen terminal');

    expect((await device('patch', '/api/v1/devices/me/heartbeat', posToken).send({ syncStatus: 'ok' })).status).toBe(200);
    expect((await device('get', '/api/v1/devices/me/commands', posToken)).status).toBe(200);

    await platform('post', `/api/v1/devices/${posDeviceId}/unlock`).send({});
    expect((await device('get', '/api/v1/orders/sync', posToken)).status).toBe(200);
  });

  it('revoking the KEY that a terminal used also revokes the terminal (DEVICE_REVOKED)', async () => {
    const revoke = await platform('patch', `/api/v1/activation-keys/${posKeyId}/revoke`);
    expect(revoke.status).toBe(200);

    const blocked = await device('get', '/api/v1/orders/sync', posToken);
    expect(blocked.status).toBe(401);
    expect(blocked.body.code).toBe('DEVICE_REVOKED');
    const row = await prisma.runAsPlatform((tx) => tx.device.findUnique({ where: { id: posDeviceId } }));
    expect(row?.status).toBe('REVOKED');
  });

  it('deactivating a branch stops the terminals bound to it (BRANCH_INACTIVE), and activating it restores them (BUG-048)', async () => {
    const branch = await platform('post', '/api/v1/branches').send({ restaurantId, name: 'Closing Branch', code: 'CLS' });
    const key = await platform('post', '/api/v1/activation-keys').send({
      restaurantId, allowedDeviceType: 'KDS', branchId: branch.body.id, label: 'Kitchen wall', expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    const redeem = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: 'KDS' });
    const branchToken = redeem.body.deviceToken as string;
    expect((await device('get', '/api/v1/orders/sync', branchToken)).status).toBe(200);

    expect((await platform('patch', `/api/v1/branches/${branch.body.id}/deactivate`)).status).toBe(200);
    const blocked = await device('get', '/api/v1/orders/sync', branchToken);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('BRANCH_INACTIVE');

    // It can still check in, and is told why it is locked.
    const hb = await device('patch', '/api/v1/devices/me/heartbeat', branchToken).send({});
    expect(hb.status).toBe(200);
    expect(hb.body).toMatchObject({ locked: true, lockCode: 'BRANCH_INACTIVE' });
    expect(hb.body.lockReason).toMatch(/Closing Branch/);

    // Terminals in other branches, or none, are untouched.
    expect((await device('get', '/api/v1/orders/sync', kdsToken)).status).toBe(200);

    await platform('patch', `/api/v1/branches/${branch.body.id}/activate`);
    expect((await device('get', '/api/v1/orders/sync', branchToken)).status).toBe(200);
    expect((await device('patch', '/api/v1/devices/me/heartbeat', branchToken).send({})).body.locked).toBe(false);
  });

  it('a suspended restaurant is refused with RESTAURANT_SUSPENDED', async () => {
    await platform('patch', `/api/v1/restaurants/${restaurantId}/suspend`);
    const blocked = await device('get', '/api/v1/orders/sync', kdsToken);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('RESTAURANT_SUSPENDED');
    await platform('patch', `/api/v1/restaurants/${restaurantId}/reactivate`);
    expect((await device('get', '/api/v1/orders/sync', kdsToken)).status).toBe(200);
  });
});
