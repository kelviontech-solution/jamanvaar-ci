import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { DEVICE_AUTH_CACHE } from '../src/common/guards/device-auth.guard';

/**
 * Closing the remaining audit items: a branch's prices reach its own terminals, a KDS screen is assigned its station by the
 * restaurant, and the per-request device verdict is cached without ever hiding a revoke, lock or entitlement change.
 */
describe('branch prices on devices, KDS stations, device verdict cache', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-bdc-${stamp}@example.com`;
  let platformToken: string;
  const restaurantIds: string[] = [];
  const planIds: string[] = [];
  const F: Record<string, any> = {};

  const http = () => request(app.getHttpServer());
  const platform = (m: 'get' | 'post' | 'patch', u: string) => http()[m](u).set('Authorization', `Bearer ${platformToken}`);
  const as = (m: 'get' | 'post' | 'put' | 'patch', u: string, t: string) => http()[m](u).set('Authorization', `Bearer ${t}`);
  const now = () => new Date().toISOString();
  const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString();
  async function redeem(rid: string, type: string, extra: Record<string, unknown> = {}) {
    const k = await platform('post', '/api/v1/activation-keys').send({ restaurantId: rid, allowedDeviceType: type, expiresAt: inDays(1), ...extra });
    const r = await http().post('/api/v1/activation/redeem').send({ code: k.body.code, deviceType: type });
    if (r.status !== 201) throw new Error(`redeem ${type}: ${r.status} ${JSON.stringify(r.body)}`);
    return { token: r.body.deviceToken as string, id: r.body.device.id as string };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;
    const p = await platform('post', '/api/v1/plans').send({ tier: 'PRO', name: `TEST BDC Plan ${stamp}`, priceMonthly: 700000, maxBranches: 5, maxDevices: 30, maxUsers: 20, entitlements: { posTerminal: true, restaurantAdmin: true, kotKdsRouting: true } });
    planIds.push(p.body.id);
    const r = await platform('post', '/api/v1/restaurants').send({ name: `TEST BDC ${stamp}`, ownerName: 'Owner', ownerEmail: `bdc-${stamp}@test.example.com` });
    F.rid = r.body.restaurant.id;
    restaurantIds.push(F.rid);
    F.sub = (await platform('post', '/api/v1/subscriptions').send({ restaurantId: F.rid, planId: p.body.id, status: 'ACTIVE', expiresAt: inDays(30) })).body.id;
    F.brA = (await platform('post', '/api/v1/branches').send({ restaurantId: F.rid, name: 'B1', code: 'BD1' })).body.id;
    F.brB = (await platform('post', '/api/v1/branches').send({ restaurantId: F.rid, name: 'B2', code: 'BD2' })).body.id;
    F.console = (await redeem(F.rid, 'POS_ADMIN')).token;
    F.posA = (await redeem(F.rid, 'POS', { branchId: F.brA })).token;
    F.posB = (await redeem(F.rid, 'POS', { branchId: F.brB })).token;
    F.kds = await redeem(F.rid, 'KDS', { branchId: F.brA, label: 'Bar screen' });
    await as('post', '/api/v1/entity-sync/MENU_CATEGORY', F.console).send({ events: [{ externalId: 'c', payload: { id: 'c', name: 'C', isActive: true, updatedAt: now() } }] });
    await as('post', '/api/v1/entity-sync/MENU_ITEM', F.console).send({ events: [{ externalId: 'tea', payload: { id: 'tea', name: 'Tea', price: 100, categoryId: 'c', isAvailable: true, updatedAt: now() } }, { externalId: 'cake', payload: { id: 'cake', name: 'Cake', price: 200, categoryId: 'c', isAvailable: true, updatedAt: now() } }] });
  }, 120_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: restaurantIds } } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: { in: planIds } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  const items = async (token: string, since = '1970-01-01T00:00:00.000Z') => {
    const r = await as('get', `/api/v1/entity-sync/MENU_ITEM?since=${encodeURIComponent(since)}`, token);
    return Object.fromEntries((r.body.entities as any[]).map((e) => [e.externalId, e.payload])) as Record<string, any>;
  };

  describe('branch prices reach the branch\'s own terminals', () => {
    it('a branch override changes that branch\'s terminals only; the restaurant-wide dish and other branches are untouched', async () => {
      const cursor = (await as('get', '/api/v1/entity-sync/MENU_ITEM?since=2999-01-01T00:00:00.000Z', F.posA)).body.serverTime;
      await new Promise((r) => setTimeout(r, 30));
      expect((await as('put', '/api/v1/menu/branch-overrides', F.console).send({ branchId: F.brA, itemId: 'tea', price: 130 })).status).toBe(200);
      await as('put', '/api/v1/menu/branch-overrides', F.console).send({ branchId: F.brA, itemId: 'cake', isAvailable: false });

      // A terminal that already pulled the dish gets it again with the branch's price (the change touches the record).
      const delta = await items(F.posA, cursor);
      expect(delta.tea.price).toBe(130);
      expect(delta.cake.isAvailable).toBe(false);
      expect(delta.cake.price).toBe(200);

      expect((await items(F.posB)).tea.price).toBe(100); // other branch
      expect((await items(F.console)).tea.price).toBe(100); // restaurant-wide console sees the base record
      const stored = await prisma.runAsPlatform((tx) => tx.syncedEntity.findFirstOrThrow({ where: { restaurantId: F.rid, entityType: 'MENU_ITEM', externalId: 'tea' } }));
      expect((stored.payload as any).price).toBe(100);
    });

    it('a branch terminal pushing the dish back cannot turn the branch price into the base price', async () => {
      const got = (await items(F.posA)).tea;
      expect(got.price).toBe(130);
      await as('post', '/api/v1/entity-sync/MENU_ITEM', F.posA).send({ events: [{ externalId: 'tea', payload: { ...got, name: 'Tea (large)', updatedAt: now() } }] });
      const stored = await prisma.runAsPlatform((tx) => tx.syncedEntity.findFirstOrThrow({ where: { restaurantId: F.rid, entityType: 'MENU_ITEM', externalId: 'tea' } }));
      expect((stored.payload as any).price).toBe(100);
      expect((stored.payload as any).name).toBe('Tea (large)'); // the rest of the edit is kept
    });

    it('clearing the override brings the base price back to the branch', async () => {
      await as('put', '/api/v1/menu/branch-overrides', F.console).send({ branchId: F.brA, itemId: 'tea', price: null, isAvailable: null });
      expect((await items(F.posA)).tea.price).toBe(100);
    });
  });

  describe('a KDS screen is assigned its station by the restaurant', () => {
    const heartbeat = (t: string) => as('patch', '/api/v1/devices/me/heartbeat', t).send({});
    it('unassigned screens choose for themselves; an assignment reaches the screen on its next heartbeat and can be cleared', async () => {
      expect((await heartbeat(F.kds.token)).body.station).toBeNull();
      const res = await as('put', `/api/v1/devices/me/fleet/${F.kds.id}/station`, F.console).send({ station: ' Bar ' });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.kitchenStation).toBe('Bar');
      expect((await heartbeat(F.kds.token)).body.station).toBe('Bar');
      await as('put', `/api/v1/devices/me/fleet/${F.kds.id}/station`, F.console).send({ station: null });
      expect((await heartbeat(F.kds.token)).body.station).toBeNull();
    });

    it('only Restaurant Admin may assign, only to a KDS of its own restaurant', async () => {
      expect((await as('put', `/api/v1/devices/me/fleet/${F.kds.id}/station`, F.posA).send({ station: 'X' })).status).toBe(403);
      const posDev = await prisma.runAsPlatform((tx) => tx.device.findFirstOrThrow({ where: { restaurantId: F.rid, type: 'POS' } }));
      expect((await as('put', `/api/v1/devices/me/fleet/${posDev.id}/station`, F.console).send({ station: 'X' })).status).toBe(400);
      expect((await as('put', '/api/v1/devices/me/fleet/00000000-0000-4000-8000-000000000000/station', F.console).send({ station: 'X' })).status).toBe(404);
    });
  });

  it('KDS hands table service to Captain only when Captain is enabled and activated in its own branch', async () => {
    const policy = async () => (await as('patch', '/api/v1/devices/me/heartbeat', F.kds.token).send({})).body.captainHandlesService;
    expect(await policy()).toBe(false);
    await prisma.runAsTenant(F.rid, tx => tx.applicationEntitlement.upsert({where:{subscriptionId_appCode:{subscriptionId:F.sub,appCode:'CAPTAIN'}},create:{restaurantId:F.rid,subscriptionId:F.sub,appCode:'CAPTAIN',enabled:true},update:{enabled:true}}));
    const otherBranch = await redeem(F.rid, 'CAPTAIN', { branchId: F.brB });
    expect(await policy()).toBe(false);
    const local = await redeem(F.rid, 'CAPTAIN', { branchId: F.brA });
    expect(await policy()).toBe(true);
    await prisma.runAsTenant(F.rid, tx => tx.device.update({where:{id:local.id},data:{status:'REVOKED'}}));
    expect(await policy()).toBe(false);
    await prisma.runAsTenant(F.rid, tx => tx.device.update({where:{id:local.id},data:{status:'ACTIVE'}}));
    await prisma.runAsTenant(F.rid, tx => tx.applicationEntitlement.update({where:{subscriptionId_appCode:{subscriptionId:F.sub,appCode:'CAPTAIN'}},data:{enabled:false}}));
    expect(await policy()).toBe(false);
    expect(otherBranch.id).not.toBe(local.id);
  });

  describe('the device verdict cache never hides a decision', () => {
    it('a cached device is stopped at once by revoke, lock, entitlement and subscription changes, and heartbeats do not flush it', async () => {
      const previous = process.env.DEVICE_AUTH_CACHE_MS;
      process.env.DEVICE_AUTH_CACHE_MS = '60000';
      try {
        const pos = await redeem(F.rid, 'KDS', { branchId: F.brA });
        const ok = () => as('get', '/api/v1/orders/sync?afterSeq=0', pos.token).then((r) => r.status);
        DEVICE_AUTH_CACHE.clear();
        expect(await ok()).toBe(200);
        expect(DEVICE_AUTH_CACHE.size).toBeGreaterThan(0);
        expect(await ok()).toBe(200); // served from the cache
        await as('patch', '/api/v1/devices/me/heartbeat', pos.token).send({});
        expect(DEVICE_AUTH_CACHE.size).toBeGreaterThan(0); // a heartbeat is not a decision

        // lock from the platform
        expect((await platform('post', `/api/v1/devices/${pos.id}/lock`).send({ reason: 'test' })).status).toBe(201);
        expect(await ok()).toBe(403);
        expect((await platform('post', `/api/v1/devices/${pos.id}/unlock`).send({})).status).toBe(201);
        expect(await ok()).toBe(200);

        // the KDS application switched off for the restaurant
        const off = await platform('patch', `/api/v1/subscriptions/${F.sub}/applications/KDS`).send({ enabled: false, acknowledgeDeviceImpact: true });
        expect(off.status, JSON.stringify(off.body)).toBe(200);
        expect(await ok()).toBe(403);
        await platform('patch', `/api/v1/subscriptions/${F.sub}/applications/KDS`).send({ enabled: true });
        expect(await ok()).toBe(200);

        // revoke
        expect((await platform('patch', `/api/v1/devices/${pos.id}/revoke`).send({})).status).toBe(200);
        expect(await ok()).toBe(401);
      } finally {
        process.env.DEVICE_AUTH_CACHE_MS = previous;
        DEVICE_AUTH_CACHE.clear();
      }
    });
  });
});
