import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Sync redesign step 4: order/KOT numbers must never collide across offline terminals. The server
 * leases disjoint blocks per branch-day; a device numbers locally from its block and only falls back
 * to device-prefixed numbers if it runs out while offline.
 */
describe('Number block leases', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-leases-${Date.now()}@example.com`;
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  let branchAId: string;
  let branchBId: string;
  let posA1: string;
  let posA2: string;
  let posB1: string;

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;
    const rest = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Leases ${Date.now()}`, ownerName: 'Owner', ownerEmail: `leases-${Date.now()}@test.example.com`
    });
    restaurantId = rest.body.restaurant.id;
    const plan = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO', name: `TEST Leases Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 5, maxDevices: 20, maxUsers: 20, entitlements: {}
    });
    planId = plan.body.id;
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString()
    });
    branchAId = (await authed('post', '/api/v1/branches', platformToken).send({ restaurantId, name: 'Ahmedabad', code: 'AHD' })).body.id;
    branchBId = (await authed('post', '/api/v1/branches', platformToken).send({ restaurantId, name: 'Surat', code: 'SUR' })).body.id;
    const mk = async (branchId: string) => {
      const key = await authed('post', '/api/v1/activation-keys', platformToken).send({
        restaurantId, branchId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString()
      });
      return (await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: 'POS' })).body.deviceToken as string;
    };
    posA1 = await mk(branchAId);
    posA2 = await mk(branchAId);
    posB1 = await mk(branchBId);
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('two terminals of one branch leasing at the same moment receive disjoint blocks', async () => {
    const [a, b] = await Promise.all([
      authed('post', '/api/v1/sync/number-leases', posA1).send({ kind: 'ORDER', count: 50 }),
      authed('post', '/api/v1/sync/number-leases', posA2).send({ kind: 'ORDER', count: 50 })
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const ranges = [a.body, b.body].map((l) => [l.start, l.start + l.count - 1]).sort((x, y) => x[0] - y[0]);
    expect(ranges[0][1]).toBeLessThan(ranges[1][0]);
    expect(a.body).toMatchObject({ kind: 'ORDER', count: 50, prefix: 'AHD' });
    expect(a.body.businessDate).toMatch(/^\d{8}$/);
  });

  it('numbering is scoped per branch: another branch starts from 1 and gets its own prefix', async () => {
    const b = await authed('post', '/api/v1/sync/number-leases', posB1).send({ kind: 'ORDER', count: 10 });
    expect(b.body).toMatchObject({ start: 1, count: 10, prefix: 'SUR' });
  });

  it('ORDER and KOT numbers are separate sequences', async () => {
    const kot = await authed('post', '/api/v1/sync/number-leases', posA1).send({ kind: 'KOT', count: 5 });
    expect(kot.body).toMatchObject({ kind: 'KOT', start: 1, count: 5 });
  });

  it('a later lease continues after the previous one with no overlap or reuse', async () => {
    const first = await authed('post', '/api/v1/sync/number-leases', posB1).send({ kind: 'KOT', count: 20 });
    const second = await authed('post', '/api/v1/sync/number-leases', posB1).send({ kind: 'KOT', count: 20 });
    expect(second.body.start).toBe(first.body.start + first.body.count);
  });

  it('rejects unreasonable or malformed requests and requires device authentication', async () => {
    expect((await authed('post', '/api/v1/sync/number-leases', posA1).send({ kind: 'ORDER', count: 100000 })).status).toBe(400);
    expect((await authed('post', '/api/v1/sync/number-leases', posA1).send({ kind: 'NOPE', count: 5 })).status).toBe(400);
    expect((await request(app.getHttpServer()).post('/api/v1/sync/number-leases').send({ kind: 'ORDER', count: 5 })).status).toBe(401);
  });
});
