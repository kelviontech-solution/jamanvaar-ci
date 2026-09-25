import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Sync redesign step 6: stock is a ledger of movements, never an overwritten number. Two terminals
 * that each sell offline add up; a retried movement counts once; branches never see each other's stock.
 */
describe('Inventory movement ledger', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-ledger-${Date.now()}@example.com`;
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  let a1: string;
  let a2: string;
  let b1: string;
  let admin: string;
  let branchBId: string;

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  const mv = (id: string, itemId: string, delta: number, type = 'SALE') => ({
    movementId: id, itemId, itemName: 'Paneer', type, quantityDelta: delta, unit: 'kg', reason: 'test', occurredAt: new Date().toISOString()
  });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;
    const rest = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Ledger ${Date.now()}`, ownerName: 'Owner', ownerEmail: `ledger-${Date.now()}@test.example.com`
    });
    restaurantId = rest.body.restaurant.id;
    const plan = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO', name: `TEST Ledger Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 5, maxDevices: 20, maxUsers: 20, entitlements: {}
    });
    planId = plan.body.id;
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString()
    });
    const branchA = (await authed('post', '/api/v1/branches', platformToken).send({ restaurantId, name: 'Branch A', code: 'AAA' })).body.id;
    const branchB = (await authed('post', '/api/v1/branches', platformToken).send({ restaurantId, name: 'Branch B', code: 'BBB' })).body.id;
    const mk = async (branchId: string | undefined, type = 'POS') => {
      const key = await authed('post', '/api/v1/activation-keys', platformToken).send({
        restaurantId, ...(branchId ? { branchId } : {}), allowedDeviceType: type, expiresAt: new Date(Date.now() + 86400000).toISOString()
      });
      return (await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: type })).body.deviceToken as string;
    };
    a1 = await mk(branchA);
    a2 = await mk(branchA);
    b1 = await mk(branchB);
    admin = await mk(undefined, 'POS_ADMIN');
    branchBId = branchB;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('two terminals selling offline add up instead of overwriting each other', async () => {
    const [r1, r2] = await Promise.all([
      authed('post', '/api/v1/inventory/movements', a1).send({ movements: [mv('A1-M1', 'paneer', -7)] }),
      authed('post', '/api/v1/inventory/movements', a2).send({ movements: [mv('A2-M1', 'paneer', -6)] })
    ]);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    const balances = await authed('get', '/api/v1/inventory/balances', a1);
    const paneer = balances.body.find((b: { itemId: string }) => b.itemId === 'paneer');
    expect(paneer.netQuantity).toBe(-13);
    expect(paneer.movementCount).toBe(2);
  });

  it('a retried movement is counted once', async () => {
    const first = await authed('post', '/api/v1/inventory/movements', a1).send({ movements: [mv('A1-M2', 'milk', -2)] });
    expect(first.body.results[0]).toMatchObject({ movementId: 'A1-M2', status: 'ok' });
    const retry = await authed('post', '/api/v1/inventory/movements', a1).send({ movements: [mv('A1-M2', 'milk', -2)] });
    expect(retry.body.results[0]).toMatchObject({ status: 'ok', duplicate: true });
    const milk = (await authed('get', '/api/v1/inventory/balances', a1)).body.find((b: { itemId: string }) => b.itemId === 'milk');
    expect(milk.netQuantity).toBe(-2);
  });

  it('a branch never sees another branch\'s stock movements', async () => {
    await authed('post', '/api/v1/inventory/movements', b1).send({ movements: [mv('B1-M1', 'paneer', -3)] });
    const bBalances = (await authed('get', '/api/v1/inventory/balances', b1)).body;
    expect(bBalances.find((b: { itemId: string }) => b.itemId === 'paneer').netQuantity).toBe(-3);
    const aPull = await authed('get', '/api/v1/inventory/movements?afterSeq=0', a1);
    expect(aPull.body.movements.map((m: { movementId: string }) => m.movementId)).not.toContain('B1-M1');
  });

  it('pulling by sequence returns other terminals\' movements in order, then nothing once caught up', async () => {
    const cursor = (await authed('get', '/api/v1/inventory/movements?afterSeq=0', a1)).body.latestSeq as number;
    await authed('post', '/api/v1/inventory/movements', a2).send({ movements: [mv('A2-M2', 'rice', 10, 'PURCHASE'), mv('A2-M3', 'rice', -4)] });
    const delta = await authed('get', `/api/v1/inventory/movements?afterSeq=${cursor}`, a1);
    expect(delta.body.movements.map((m: { movementId: string }) => m.movementId)).toEqual(['A2-M2', 'A2-M3']);
    expect(delta.body.movements[0]).toMatchObject({ deviceId: expect.any(String), type: 'PURCHASE', quantityDelta: 10 });
    const done = await authed('get', `/api/v1/inventory/movements?afterSeq=${delta.body.latestSeq}`, a1);
    expect(done.body.movements).toHaveLength(0);
  });

  it('rejects malformed movements per item without blocking valid ones, and needs device auth', async () => {
    const res = await authed('post', '/api/v1/inventory/movements', a1).send({
      movements: [{ movementId: 'bad', itemId: 'x' }, mv('A1-M9', 'salt', -1)]
    });
    expect(res.body.results[0].status).toBe('error');
    expect(res.body.results[1].status).toBe('ok');
    expect((await request(app.getHttpServer()).get('/api/v1/inventory/balances')).status).toBe(401);
  });

  it('a restaurant-wide admin device sees every branch, tagged by branch, and can post a movement for a specific branch', async () => {
    const post = await authed('post', '/api/v1/inventory/movements', admin).send({ movements: [{ ...mv('ADM-1', 'flour', -5), branchId: branchBId }] });
    expect(post.body.results[0].status).toBe('ok');
    const all = (await authed('get', '/api/v1/inventory/balances', admin)).body as Array<{ itemId: string; branchId: string | null; netQuantity: number }>;
    expect(all.filter((b) => b.itemId === 'paneer').map((b) => b.netQuantity).sort()).toEqual([-13, -3]);
    expect(all.find((b) => b.itemId === 'flour')).toMatchObject({ branchId: branchBId, netQuantity: -5 });
    expect((await authed('get', '/api/v1/inventory/balances', b1)).body.map((b: { itemId: string }) => b.itemId)).toContain('flour');
  });

  it('rejects a movement for a branch that is not this restaurant,  and a branch device cannot redirect its movements', async () => {
    const foreign = await authed('post', '/api/v1/inventory/movements', admin).send({ movements: [{ ...mv('ADM-2', 'flour', -1), branchId: '00000000-0000-0000-0000-000000000000' }] });
    expect(foreign.body.results[0].status).toBe('error');
    await authed('post', '/api/v1/inventory/movements', a1).send({ movements: [{ ...mv('A1-REDIR', 'oil', -1), branchId: branchBId }] });
    const bView = (await authed('get', '/api/v1/inventory/balances', b1)).body.map((b: { itemId: string }) => b.itemId);
    expect(bView).not.toContain('oil');
  });
});
