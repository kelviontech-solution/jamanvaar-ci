import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * BUG-008: the POS opened at an unexplained 130% size, and nothing in Restaurant Admin controlled it. A
 * restaurant now sets a default display size for its terminals in Restaurant Admin; every terminal learns it
 * with its heartbeat (and can still override it on that one screen).
 */
describe('Terminal display size (BUG-008)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const staffEmail = `ds-staff-${stamp}@example.com`;
  const ownerEmail = `ds-owner-${stamp}@test.example.com`;
  const password = 'correct-horse-battery-staple';
  const ownerPassword = 'owner-password-long-enough';
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  let ownerToken: string;
  let staffUserToken: string;
  let deviceToken: string;

  const platform = (method: 'get' | 'post', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${platformToken}`);
  const owner = (method: 'get' | 'patch', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${ownerToken}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: staffEmail, password });
    platformToken = (await platformLogin(app, staffEmail, password)).body.accessToken;

    const rest = await platform('post', '/api/v1/restaurants').send({ name: `TEST Display ${stamp}`, ownerName: 'Owner', ownerEmail });
    restaurantId = rest.body.restaurant.id;
    await request(app.getHttpServer()).post('/api/v1/tenant-auth/set-initial-password').send({ restaurantId, email: ownerEmail, activationToken: rest.body.activationToken, newPassword: ownerPassword });
    planId = (await platform('post', '/api/v1/plans').send({ tier: 'PRO', name: `TEST DS Plan ${stamp}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { posTerminal: true } })).body.id;
    await platform('post', '/api/v1/subscriptions').send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });

    const adminKey = await platform('post', '/api/v1/activation-keys').send({ restaurantId, allowedDeviceType: 'POS_ADMIN', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const adminDevice = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: adminKey.body.code, deviceType: 'POS_ADMIN' });
    const session = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login').send({ email: ownerEmail, password: ownerPassword, restaurantId, deviceId: adminDevice.body.device.id, deviceToken: adminDevice.body.deviceToken, deviceType: 'POS_ADMIN' });
    ownerToken = session.body.accessToken;

    // A POS terminal for the heartbeat.
    const posKey = await platform('post', '/api/v1/activation-keys').send({ restaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const pos = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: posKey.body.code, deviceType: 'POS' });
    deviceToken = pos.body.deviceToken;

    // A staff login (not owner or manager) issued by the owner. Uses the POS device,
    // not the POS_ADMIN one above — security-audit HIGH-04 now correctly refuses a
    // STAFF login against an admin-console device type (POS_ADMIN/KIOSK_ADMIN), and
    // this test's own point is to check a non-owner/manager role against the display
    // endpoint, not to (mis)use POS_ADMIN as an incidental login vehicle for it.
    const staffEmailLogin = `ds-cashier-${stamp}@test.example.com`;
    const created = await request(app.getHttpServer()).post('/api/v1/tenant/me/users').set('Authorization', `Bearer ${ownerToken}`).send({ email: staffEmailLogin, fullName: 'Cashier One', role: 'STAFF', password: 'cashier-password-123' });
    expect(created.status).toBe(201);
    const staffSession = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login').send({ email: staffEmailLogin, password: 'cashier-password-123', restaurantId, deviceId: pos.body.device.id, deviceToken: pos.body.deviceToken, deviceType: 'POS' });
    staffUserToken = staffSession.body.accessToken;
    expect(staffUserToken).toBeTruthy();
  }, 120_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: staffEmail } });
    await app.close();
  });

  it('a restaurant starts at 100%, not an inflated size', async () => {
    const res = await owner('get', '/api/v1/tenant/me/display');
    expect(res.status).toBe(200);
    expect(res.body.displayScalePercent).toBe(100);
  });

  it('the owner sets the default for the restaurant, and it is remembered', async () => {
    const set = await owner('patch', '/api/v1/tenant/me/display').send({ displayScalePercent: 120 });
    expect(set.status).toBe(200);
    expect(set.body.displayScalePercent).toBe(120);
    expect((await owner('get', '/api/v1/tenant/me/display')).body.displayScalePercent).toBe(120);
  });

  it('only sensible sizes are accepted', async () => {
    for (const bad of [50, 69, 151, 300, 110.5, 'big', null]) {
      const res = await owner('patch', '/api/v1/tenant/me/display').send({ displayScalePercent: bad });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect((await owner('get', '/api/v1/tenant/me/display')).body.displayScalePercent).toBe(120);
  });

  it('every terminal learns the default with its heartbeat', async () => {
    const hb = await request(app.getHttpServer()).patch('/api/v1/devices/me/heartbeat').set('Authorization', `Bearer ${deviceToken}`).send({});
    expect(hb.status).toBe(200);
    expect(hb.body.displayScalePercent).toBe(120);

    await owner('patch', '/api/v1/tenant/me/display').send({ displayScalePercent: 100 });
    const again = await request(app.getHttpServer()).patch('/api/v1/devices/me/heartbeat').set('Authorization', `Bearer ${deviceToken}`).send({});
    expect(again.body.displayScalePercent).toBe(100);
  });

  it('a staff login cannot change it, and it needs a restaurant session', async () => {
    const res = await request(app.getHttpServer()).patch('/api/v1/tenant/me/display').set('Authorization', `Bearer ${staffUserToken}`).send({ displayScalePercent: 90 });
    expect(res.status).toBe(403);
    expect((await request(app.getHttpServer()).get('/api/v1/tenant/me/display')).status).toBe(401);
    expect((await request(app.getHttpServer()).patch('/api/v1/tenant/me/display').send({ displayScalePercent: 90 })).status).toBe(401);
  });
});
