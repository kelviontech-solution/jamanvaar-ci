import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Publishing creates a numbered menu version. Each device reports the version it has applied, so
 * support can see at a glance which kiosk/POS is behind and needs a sync.
 */
describe('Menu publishing and per-device applied version', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-menuver-${stamp}@example.com`;
  let platformToken: string;
  const restaurantIds: string[] = [];
  const planIds: string[] = [];
  let admin: string;
  let kioskAdmin: string;
  let kiosk: string;
  let kioskId: string;
  let otherAdmin: string;

  const platform = (method: 'get' | 'post', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${platformToken}`);
  const as = (method: 'get' | 'post', url: string, token: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  const beat = (token: string, body: Record<string, unknown>) => request(app.getHttpServer()).patch('/api/v1/devices/me/heartbeat').set('Authorization', `Bearer ${token}`).send(body);

  async function restaurant(name: string) {
    const rest = await platform('post', '/api/v1/restaurants').send({ name: `TEST ${name} ${stamp}`, ownerName: 'Owner', ownerEmail: `${name.toLowerCase().replace(/\W/g, '')}-${stamp}@test.example.com` });
    const id = rest.body.restaurant.id as string;
    restaurantIds.push(id);
    const plan = await platform('post', '/api/v1/plans').send({ tier: 'PRO', productFamily: 'RESTAURANT', name: `TEST ${name} Plan ${stamp}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: {} });
    planIds.push(plan.body.id);
    await platform('post', '/api/v1/subscriptions').send({ restaurantId: id, planId: plan.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), applications: ['POS', 'POS_ADMIN', 'KIOSK', 'KIOSK_ADMIN'] });
    return id;
  }
  async function activate(restaurantId: string, type: string) {
    const key = await platform('post', '/api/v1/activation-keys').send({ restaurantId, allowedDeviceType: type, expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const res = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: type });
    return { token: res.body.deviceToken as string, id: res.body.device.id as string };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;
    const rid = await restaurant('MenuVer');
    admin = (await activate(rid, 'POS_ADMIN')).token;
    kioskAdmin = (await activate(rid, 'KIOSK_ADMIN')).token;
    const k = await activate(rid, 'KIOSK');
    kiosk = k.token; kioskId = k.id;
    const other = await restaurant('MenuVerOther');
    otherAdmin = (await activate(other, 'POS_ADMIN')).token;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: restaurantIds } } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: { in: planIds } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('a restaurant starts with no published version', async () => {
    const res = await as('get', '/api/v1/menu/version', admin);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ version: 0, watermark: null });
  });

  it('Restaurant Admin publishes numbered versions; the watermark moves forward', async () => {
    const one = await as('post', '/api/v1/menu/publish', admin).send({ note: 'Diwali specials' });
    expect(one.status).toBe(201);
    expect(one.body).toMatchObject({ version: 1, note: 'Diwali specials' });
    const two = await as('post', '/api/v1/menu/publish', admin).send({});
    expect(two.body.version).toBe(2);
    expect(new Date(two.body.watermark).getTime()).toBeGreaterThanOrEqual(new Date(one.body.watermark).getTime());
    expect((await as('get', '/api/v1/menu/version', kiosk)).body.version).toBe(2);
  });

  it('only Restaurant Admin can publish, and versions are per restaurant', async () => {
    expect((await as('post', '/api/v1/menu/publish', kiosk).send({})).status).toBe(403);
    expect((await as('post', '/api/v1/menu/publish', kioskAdmin).send({})).status).toBe(403);
    expect((await as('get', '/api/v1/menu/version', otherAdmin)).body.version).toBe(0);
  });

  it('a device reports the version it applied, and the fleet shows who is behind', async () => {
    await beat(kiosk, { menuVersion: 1 });
    let fleet = await as('get', '/api/v1/devices/me/fleet', kioskAdmin);
    let k = fleet.body.devices.find((d: { id: string }) => d.id === kioskId);
    expect(k).toMatchObject({ menuVersion: 1, latestMenuVersion: 2, menuStatus: 'behind' });

    await beat(kiosk, { menuVersion: 2 });
    fleet = await as('get', '/api/v1/devices/me/fleet', kioskAdmin);
    k = fleet.body.devices.find((d: { id: string }) => d.id === kioskId);
    expect(k).toMatchObject({ menuVersion: 2, menuStatus: 'current' });
  });

  it('publishing is audited', async () => {
    const audit = await prisma.runAsPlatform((tx) => tx.auditLog.findFirst({ where: { action: 'MENU_PUBLISHED', restaurantId: { in: restaurantIds } }, orderBy: { createdAt: 'desc' } }));
    expect(audit).toBeTruthy();
  });
});
