import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * BUG-060 / 067 / 069 / 048: keys and devices were flat, unbounded lists filtered in the browser.
 * Lifecycle, counts, health, grouping and bulk actions now come from the server, keys can be issued
 * for a branch and a named terminal, and a redeemed key no longer exposes its code.
 */
describe('Activation keys and fleet lists (BUG-060/067/069/048)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const email = `fleet-owner-${stamp}@example.com`;
  const password = 'correct-horse-battery-staple';
  let token: string;
  let restaurantId: string;
  let otherRestaurantId: string;
  let branchId: string;
  let planId: string;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const api = (method: 'get' | 'post' | 'patch', url: string) => auth(request(app.getHttpServer())[method](url));
  const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();

  async function makeKey(extra: Record<string, unknown> = {}, rid = restaurantId) {
    const res = await api('post', '/api/v1/activation-keys').send({ restaurantId: rid, allowedDeviceType: 'POS', expiresAt: inDays(7), ...extra });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as { id: string; code: string };
  }
  const redeem = (code: string) =>
    request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code, deviceType: 'POS', appVersion: '1.0.0' });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email, password });
    token = (await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email, password })).body.accessToken;

    const mk = async (label: string) =>
      (await api('post', '/api/v1/restaurants').send({ name: `TEST Fleet ${label} ${stamp}`, ownerName: `Owner ${label}`, ownerEmail: `fleet-${label}-${stamp}@example.com` })).body.restaurant.id as string;
    restaurantId = await mk('a');
    otherRestaurantId = await mk('b');
    branchId = (await api('post', '/api/v1/branches').send({ restaurantId, name: 'Fleet Branch', code: 'FB' })).body.id;

    planId = (await api('post', '/api/v1/plans').send({
      tier: 'PRO', name: `TEST Fleet Plan ${stamp}`, priceMonthly: 700000, maxBranches: 5, maxDevices: 50, maxUsers: 20, entitlements: { posTerminal: true }
    })).body.id;
    for (const rid of [restaurantId, otherRestaurantId]) {
      await api('post', '/api/v1/subscriptions').send({ restaurantId: rid, planId, status: 'ACTIVE', expiresAt: inDays(30) });
    }
  }, 60_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: [restaurantId, otherRestaurantId].filter(Boolean) } } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email } });
    await app.close();
  });

  describe('activation keys', () => {
    it('can be issued for a branch with a label and batch, and redeeming binds the device to them', async () => {
      const key = await makeKey({ branchId, label: 'Counter 1', batchId: 'kit-1' });
      expect(key.code).toBeTypeOf('string');

      const red = await redeem(key.code);
      expect(red.status).toBe(201);
      const device = await prisma.runAsPlatform((tx) => tx.device.findUniqueOrThrow({ where: { id: red.body.device.id } }));
      expect(device.branchId).toBe(branchId);
      expect(device.name).toBe('Counter 1');
    });

    it('refuses a branch that belongs to another restaurant', async () => {
      const res = await api('post', '/api/v1/activation-keys').send({ restaurantId: otherRestaurantId, allowedDeviceType: 'POS', expiresAt: inDays(7), branchId });
      expect(res.status).toBe(404);
    });

    it('pages, searches and filters by lifecycle on the server, with counts', async () => {
      await makeKey({ label: 'Kitchen wall' });
      const expiring = await makeKey({ expiresAt: inDays(1) });
      const past = await makeKey({ label: 'Old key' });
      await prisma.runAsPlatform((tx) => tx.activationKey.update({ where: { id: past.id }, data: { expiresAt: new Date(Date.now() - 1000) } }));

      const all = await api('get', '/api/v1/activation-keys').query({ restaurantId, page: 1, pageSize: 2 });
      expect(all.status).toBe(200);
      expect(all.body.items).toHaveLength(2);
      expect(all.body.total).toBeGreaterThanOrEqual(4);
      expect(all.body.lifecycleCounts).toMatchObject({ AVAILABLE: expect.any(Number), REDEEMED: 1, EXPIRED: 1, REVOKED: 0 });

      const expired = await api('get', '/api/v1/activation-keys').query({ restaurantId, page: 1, lifecycle: 'EXPIRED' });
      expect(expired.body.items.map((k: { id: string }) => k.id)).toEqual([past.id]);
      expect(expired.body.items[0].lifecycle).toBe('EXPIRED');

      expect((await api('get', '/api/v1/activation-keys').query({ restaurantId, page: 1, q: 'kitchen' })).body.items).toHaveLength(1);
      expect((await api('get', '/api/v1/activation-keys').query({ restaurantId, page: 1, batchId: 'kit-1' })).body.total).toBe(1);
      expect((await api('get', '/api/v1/activation-keys').query({ restaurantId, page: 1, expiringInDays: 2 })).body.items.map((k: { id: string }) => k.id)).toEqual([expiring.id]);
    });

    it('without a page it still returns the plain array', async () => {
      const res = await api('get', '/api/v1/activation-keys').query({ restaurantId });
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('stops exposing the code once the key is no longer usable, keeping only its last 4 characters', async () => {
      const used = await api('get', '/api/v1/activation-keys').query({ restaurantId, page: 1, lifecycle: 'REDEEMED' });
      const row = used.body.items[0];
      expect(row.code).toBeNull();
      expect(row.codeLast4).toMatch(/^.{4}$/);

      const available = (await api('get', '/api/v1/activation-keys').query({ restaurantId, page: 1, lifecycle: 'AVAILABLE' })).body.items[0];
      expect(available.code).toBeTypeOf('string');
    });

    it('summarises keys per restaurant', async () => {
      const res = await api('get', '/api/v1/activation-keys/by-restaurant');
      const row = res.body.find((r: { restaurantId: string }) => r.restaurantId === restaurantId);
      expect(row).toMatchObject({ restaurantName: `TEST Fleet a ${stamp}`, redeemed: 1, expired: 1, revoked: 0 });
      expect(row.available).toBeGreaterThanOrEqual(2);
      expect(row.expiringSoon).toBeGreaterThanOrEqual(1);
    });

    it('revokes many keys in one call and skips the ones that cannot be revoked', async () => {
      const a = await makeKey();
      const b = await makeKey();
      const used = (await api('get', '/api/v1/activation-keys').query({ restaurantId, page: 1, lifecycle: 'REDEEMED' })).body.items[0];
      const res = await api('post', '/api/v1/activation-keys/bulk-revoke').send({ ids: [a.id, b.id, used.id] });
      expect(res.status).toBe(201);
      // A redeemed key can be revoked too (that revokes its terminal): all three succeed, none skipped.
      expect(res.body).toMatchObject({ revoked: 3, skipped: 0 });
      expect((await api('post', '/api/v1/activation-keys/bulk-revoke').send({ ids: [a.id] })).body).toMatchObject({ revoked: 0, skipped: 1 });
    });
  });

  describe('fleet', () => {
    const mkDevice = (over: Record<string, unknown>, rid = restaurantId) =>
      prisma.runAsPlatform((tx) => tx.device.create({ data: { restaurantId: rid, type: 'POS', status: 'ACTIVE', ...over } as never }));
    const ago = (ms: number) => new Date(Date.now() - ms);
    let onlineId: string;

    beforeAll(async () => {
      onlineId = (await mkDevice({ name: 'Online one', lastSeenAt: ago(20_000) })).id;
      await mkDevice({ name: 'Degraded one', lastSeenAt: ago(8 * 60_000) });
      await mkDevice({ name: 'Offline one', lastSeenAt: ago(5 * 3600_000), syncError: 'push failed' });
      await mkDevice({ name: 'Revoked one', status: 'REVOKED', lastSeenAt: ago(9 * 3600_000) });
      await mkDevice({ name: 'Never seen', lastSeenAt: null });
      await mkDevice({ name: 'Other restaurant', lastSeenAt: ago(10_000) }, otherRestaurantId);
    });

    it('counts health on the server with revoked and never-seen kept out of "offline"', async () => {
      const res = await api('get', '/api/v1/devices').query({ restaurantId, page: 1, pageSize: 50 });
      expect(res.status).toBe(200);
      const c = res.body.healthCounts;
      expect(c.online).toBeGreaterThanOrEqual(1);
      // Revoked is at least 2: the earlier bulk revoke also revoked the redeemed key's terminal.
      expect(c).toMatchObject({ degraded: 1, offline: 1, never_seen: 1 });
      expect(c.revoked).toBeGreaterThanOrEqual(2);
      const byName = Object.fromEntries(res.body.items.map((d: { name: string; health: string }) => [d.name, d.health]));
      expect(byName).toMatchObject({ 'Online one': 'online', 'Degraded one': 'degraded', 'Offline one': 'offline', 'Revoked one': 'revoked', 'Never seen': 'never_seen' });
    });

    it('filters by health, type and text', async () => {
      const off = await api('get', '/api/v1/devices').query({ restaurantId, page: 1, health: 'offline' });
      expect(off.body.items.map((d: { name: string }) => d.name)).toEqual(['Offline one']);
      expect((await api('get', '/api/v1/devices').query({ restaurantId, page: 1, q: 'degraded' })).body.total).toBe(1);
      expect((await api('get', '/api/v1/devices').query({ restaurantId, page: 1, type: 'KDS' })).body.total).toBe(0);
    });

    it('filters locked terminals and counts them for the scope', async () => {
      await mkDevice({ name: 'Locked one', lastSeenAt: ago(10_000), isLocked: true, lockReason: 'Stolen' });
      const res = await api('get', '/api/v1/devices').query({ restaurantId, page: 1, locked: 'true' });
      expect(res.body.items.map((d: { name: string }) => d.name)).toEqual(['Locked one']);
      expect((await api('get', '/api/v1/devices').query({ restaurantId, page: 1 })).body.lockedCount).toBe(1);
    });

    it('"needs attention" lists offline, degraded and sync-failing devices only', async () => {
      const res = await api('get', '/api/v1/devices').query({ restaurantId, page: 1, needsAttention: 'true' });
      expect(res.body.items.map((d: { name: string }) => d.name).sort()).toEqual(['Degraded one', 'Offline one']);
    });

    it('summarises the fleet per restaurant', async () => {
      const res = await api('get', '/api/v1/devices/by-restaurant');
      const a = res.body.find((r: { restaurantId: string }) => r.restaurantId === restaurantId);
      expect(a).toMatchObject({ total: expect.any(Number), degraded: 1, offline: 1, neverSeen: 1 });
      expect(a.revoked).toBeGreaterThanOrEqual(2);
      expect(a.needsAttention).toBeGreaterThanOrEqual(2);
      expect(res.body.find((r: { restaurantId: string }) => r.restaurantId === otherRestaurantId).online).toBe(1);
    });

    it('lets a terminal be given a real name, validated', async () => {
      const ok = await api('patch', `/api/v1/devices/${onlineId}`).send({ name: 'Counter 2' });
      expect(ok.status).toBe(200);
      expect(ok.body.name).toBe('Counter 2');
      expect((await api('patch', `/api/v1/devices/${onlineId}`).send({ name: '' })).status).toBe(400);
      expect((await api('patch', `/api/v1/devices/${onlineId}`).send({ name: 'x'.repeat(200) })).status).toBe(400);
    });
  });

  describe('order branch stamping (BUG-048)', () => {
    it('orders pushed from a branch terminal carry that branch, so sales can be compared per branch', async () => {
      const key = await makeKey({ branchId, label: 'Branch till' });
      const red = await redeem(key.code);
      const event = {
        externalOrderId: `branch-ord-${stamp}`, orderType: 'TAKEAWAY', status: 'COMPLETED',
        items: [{ externalItemId: 'i1', name: 'Tea', quantity: 1, unitPrice: 5000, kitchenStatus: 'SERVED', lineTotal: 5000 }],
        subtotal: 5000, taxAmount: 250, discountAmount: 0, totalAmount: 5250, paymentStatus: 'SUCCESS', paymentMethod: 'CASH', updatedAt: new Date().toISOString()
      };
      const push = await request(app.getHttpServer()).post('/api/v1/orders/sync').set('Authorization', `Bearer ${red.body.deviceToken}`).send({ events: [event] });
      expect(push.status).toBe(201);
      expect(push.body.results[0], JSON.stringify(push.body)).toMatchObject({ status: 'ok' });
      const saved = await prisma.runAsPlatform((tx) => tx.syncedOrder.findFirstOrThrow({ where: { restaurantId, externalOrderId: event.externalOrderId } }));
      expect(saved.branchId).toBe(branchId);
    });
  });

});
