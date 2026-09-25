import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * The Branch Core keeps a local copy of who may talk to it (device credentials as hashes, which apps each
 * device may run, subscription window), so it can authorize devices while the internet is down. It is
 * downloaded by the Restaurant Admin console device, scoped to the restaurant (and branch if bound).
 */
describe('Branch roster (for the Branch Core)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-roster-${stamp}@example.com`;
  let platformToken: string;
  const restaurantIds: string[] = [];
  const planIds: string[] = [];
  let core: string;
  let pos: string;
  let posId: string;
  let branchA: string;
  let otherRestaurantPos: string;

  const platform = (method: 'get' | 'post', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${platformToken}`);
  const as = (method: 'get', url: string, token: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  async function restaurant(name: string) {
    const rest = await platform('post', '/api/v1/restaurants').send({ name: `TEST ${name} ${stamp}`, ownerName: 'Owner', ownerEmail: `${name.toLowerCase().replace(/\W/g, '')}-${stamp}@test.example.com` });
    const id = rest.body.restaurant.id as string;
    restaurantIds.push(id);
    const plan = await platform('post', '/api/v1/plans').send({ tier: 'PRO', name: `TEST ${name} Plan ${stamp}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: {} });
    planIds.push(plan.body.id);
    await platform('post', '/api/v1/subscriptions').send({ restaurantId: id, planId: plan.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
    return id;
  }
  async function activate(restaurantId: string, type: string, branchId?: string) {
    const key = await platform('post', '/api/v1/activation-keys').send({ restaurantId, ...(branchId ? { branchId } : {}), allowedDeviceType: type, expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const res = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: type });
    return { token: res.body.deviceToken as string, id: res.body.device.id as string };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;
    const rid = await restaurant('Roster');
    branchA = (await platform('post', '/api/v1/branches').send({ restaurantId: rid, name: 'Branch Roster A', code: 'RSA' })).body.id;
    core = (await activate(rid, 'POS_ADMIN')).token;
    const p = await activate(rid, 'POS', branchA);
    pos = p.token; posId = p.id;
    const other = await restaurant('RosterOther');
    otherRestaurantPos = (await activate(other, 'POS')).token;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: restaurantIds } } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: { in: planIds } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('gives the console everything needed to authorize devices offline', async () => {
    const res = await as('get', '/api/v1/devices/me/roster', core);
    expect(res.status).toBe(200);
    const d = res.body.devices.find((x: { id: string }) => x.id === posId);
    expect(d).toMatchObject({ type: 'POS', branchId: branchA, status: 'ACTIVE', appEnabled: true });
    expect(d.tokenHash).toBe(createHash('sha256').update(pos).digest('hex'));
    expect(res.body.branches.some((b: { id: string; code: string }) => b.id === branchA && b.code === 'RSA')).toBe(true);
    expect(res.body.subscription).toMatchObject({ active: true, expiresAt: expect.any(String) });
    expect(res.body.restaurant).toMatchObject({ status: 'ACTIVE' });
    expect(typeof res.body.serverTime).toBe('string');
  });

  it('never includes another restaurant\'s devices or any plain credential', async () => {
    const res = await as('get', '/api/v1/devices/me/roster', core);
    const ids = res.body.devices.map((x: { id: string }) => x.id);
    expect(ids).toHaveLength(2); // the console itself and the POS
    expect(JSON.stringify(res.body)).not.toContain(pos);
  });

  it('is only available to an admin console device', async () => {
    expect((await as('get', '/api/v1/devices/me/roster', pos)).status).toBe(403);
    expect((await as('get', '/api/v1/devices/me/roster', otherRestaurantPos)).status).toBe(403);
    expect((await request(app.getHttpServer()).get('/api/v1/devices/me/roster')).status).toBe(401);
  });

  it('reflects revocation so the core stops trusting a revoked device', async () => {
    await platform('post', `/api/v1/devices/${posId}/commands`).send({ commandType: 'DISABLE_DEVICE' });
    const res = await as('get', '/api/v1/devices/me/roster', core);
    const d = res.body.devices.find((x: { id: string }) => x.id === posId);
    expect(d.status).toBe('REVOKED');
  });
});
