import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Regression tests for the onboarding / multi-app audit fixes: order state rules, header versioning, price review flags,
 * origin device, terminal re-binding, terminal naming, floor-plan branch scope, two kitchens on one order.
 */
describe('onboarding and multi-app hardening', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-harden-${stamp}@example.com`;
  let platformToken: string;
  const restaurantIds: string[] = [];
  const planIds: string[] = [];
  const F: Record<string, any> = {};

  const http = () => request(app.getHttpServer());
  const platform = (m: 'get' | 'post' | 'patch', u: string) => http()[m](u).set('Authorization', `Bearer ${platformToken}`);
  const as = (m: 'get' | 'post', u: string, t: string) => http()[m](u).set('Authorization', `Bearer ${t}`);
  const now = () => new Date().toISOString();
  const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString();
  const key = (rid: string, type: string, extra: Record<string, unknown> = {}) => platform('post', '/api/v1/activation-keys').send({ restaurantId: rid, allowedDeviceType: type, expiresAt: inDays(1), ...extra });
  async function redeem(rid: string, type: string, extra: Record<string, unknown> = {}) {
    const k = await key(rid, type, extra);
    if (k.status !== 201) return { keyStatus: k.status, status: k.status, body: k.body } as any;
    const r = await http().post('/api/v1/activation/redeem').send({ code: k.body.code, deviceType: type });
    return { keyStatus: 201, status: r.status, token: r.body.deviceToken as string, device: r.body.device, body: r.body };
  }
  const item = (id: string, status = 'PENDING', price = 1000) => ({ externalItemId: id, name: id, quantity: 1, unitPrice: price, modifiers: [], lineTotal: price, kitchenStatus: status });
  const order = (id: string, status: string, items = [item('i1')], extra: Record<string, unknown> = {}) => {
    const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
    return { eventId: `e-${id}-${status}-${Math.random().toString(36).slice(2)}`, externalOrderId: id, orderType: 'DINE_IN', status, items, subtotal, taxAmount: 0, discountAmount: 0, totalAmount: subtotal, updatedAt: now(), ...extra };
  };
  const push = (t: string, ev: any) => as('post', '/api/v1/orders/sync', t).send({ events: [ev] });
  const row = (id: string) => prisma.runAsPlatform((tx) => tx.syncedOrder.findFirstOrThrow({ where: { restaurantId: F.rid, externalOrderId: id } }));
  const conflicts = (id: string) => prisma.runAsPlatform((tx) => tx.syncConflict.findMany({ where: { restaurantId: F.rid, entityId: id }, orderBy: { createdAt: 'asc' } }));

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;
    const p = await platform('post', '/api/v1/plans').send({ tier: 'PRO', name: `TEST Harden Plan ${stamp}`, priceMonthly: 700000, maxBranches: 5, maxDevices: 30, maxUsers: 20, entitlements: { posTerminal: true, restaurantAdmin: true, kotKdsRouting: true, selfOrderKiosk: true } });
    planIds.push(p.body.id);
    const r = await platform('post', '/api/v1/restaurants').send({ name: `TEST Harden ${stamp}`, ownerName: 'Owner', ownerEmail: `harden-${stamp}@test.example.com` });
    F.rid = r.body.restaurant.id;
    restaurantIds.push(F.rid);
    await platform('post', '/api/v1/subscriptions').send({ restaurantId: F.rid, planId: p.body.id, status: 'ACTIVE', expiresAt: inDays(30) });
    F.brA = (await platform('post', '/api/v1/branches').send({ restaurantId: F.rid, name: 'H1', code: 'HH1' })).body.id;
    F.brB = (await platform('post', '/api/v1/branches').send({ restaurantId: F.rid, name: 'H2', code: 'HH2' })).body.id;
    F.pos = (await redeem(F.rid, 'POS', { branchId: F.brA, label: 'POS-01' })).token;
    F.pos2 = (await redeem(F.rid, 'POS', { branchId: F.brA, label: 'POS-02' })).token;
    F.kds1 = (await redeem(F.rid, 'KDS', { branchId: F.brA, label: 'KDS-Kitchen' })).token;
    F.kds2 = (await redeem(F.rid, 'KDS', { branchId: F.brA, label: 'KDS-Bar' })).token;
    F.captain = (await redeem(F.rid, 'CAPTAIN', { branchId: F.brA })).token;
    F.posB = (await redeem(F.rid, 'POS', { branchId: F.brB })).token;
  }, 120_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: restaurantIds } } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: { in: planIds } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  describe('order state rules', () => {
    it('a stale or wrong-way status is not applied, is recorded, and the rest of the push still merges', async () => {
      await push(F.pos, order('h-status', 'NEW'));
      await push(F.kds1, order('h-status', 'READY', [item('i1', 'READY')]));
      const stale = await push(F.pos, order('h-status', 'PREPARING', [item('i1', 'PREPARING'), item('i2')]));
      expect(stale.body.results[0].status).toBe('ok'); // acknowledged: the device must not retry forever
      const o = await row('h-status');
      expect(o.status).toBe('READY');
      expect((o.items as any[]).map((i) => i.externalItemId).sort()).toEqual(['i1', 'i2']); // the new item was kept
      expect((o.items as any[]).find((i) => i.externalItemId === 'i1').kitchenStatus).toBe('READY');
      expect((await conflicts('h-status')).map((c) => c.reason).join(' ')).toContain('STATUS_REGRESSION');
    });

    it('a counter device may correct an order on purpose; nobody else may', async () => {
      await push(F.pos, order('h-correct', 'COMPLETED'));
      await push(F.kds1, order('h-correct', 'PREPARING', undefined, { meta: { statusCorrection: true } }));
      expect((await row('h-correct')).status).toBe('COMPLETED');
      await push(F.pos, order('h-correct', 'PREPARING', undefined, { meta: { statusCorrection: true } }));
      expect((await row('h-correct')).status).toBe('PREPARING');
      expect(JSON.stringify((await row('h-correct')).meta)).not.toContain('statusCorrection');
    });

    it('a cancelled order cannot be reopened by a push, and a kiosk cannot run the kitchen', async () => {
      await push(F.pos, order('h-cancel', 'CANCELLED'));
      await push(F.pos2, order('h-cancel', 'PREPARING'));
      expect((await row('h-cancel')).status).toBe('CANCELLED');

      const kiosk = (await redeem(F.rid, 'KIOSK', { branchId: F.brA })).token;
      expect(kiosk).toBeTruthy();
      await push(kiosk, order('h-kiosk', 'NEW', undefined, { meta: { sourceType: 'KIOSK' } }));
      await push(kiosk, order('h-kiosk', 'READY'));
      expect((await row('h-kiosk')).status).toBe('NEW');
      expect((await conflicts('h-kiosk')).map((c) => c.reason).join(' ')).toContain('STATUS_NOT_PERMITTED');
    });

    it('a push based on an older version keeps the server\'s totals and table, and flags the order', async () => {
      await push(F.pos, order('h-ver', 'NEW', [item('i1', 'PENDING', 1000)]));
      const v1 = (await row('h-ver')).syncVersion;
      await push(F.captain, order('h-ver', 'NEW', [item('i1', 'PENDING', 1000), item('i9', 'PENDING', 500)], { tableId: 'T7', tableLabel: '7', baseSyncVersion: v1 }));
      const v2 = await row('h-ver');
      expect(v2.totalAmount).toBe(1500);
      // POS still has the old copy (version v1) and pushes its old totals
      await push(F.pos, order('h-ver', 'NEW', [item('i1', 'PENDING', 1000)], { baseSyncVersion: v1 }));
      const after = await row('h-ver');
      expect(after.totalAmount).toBe(1500); // Captain's total survives
      expect(after.tableId).toBe('T7');
      expect((after.meta as any).needsTotalsReview).toBe(true);
      expect((await conflicts('h-ver')).map((c) => c.reason).join(' ')).toContain('STALE_HEADER');
    });
  });

  describe('device-priced orders are checked, never rejected', () => {
    it('a price below the published menu price and inconsistent totals are flagged for review and recorded', async () => {
      await as('post', '/api/v1/entity-sync/MENU_ITEM', F.pos).send({ events: [{ externalId: 'pizza', payload: { id: 'pizza', name: 'Pizza', price: 10, categoryId: 'c', updatedAt: now() } }] });
      const res = await push(F.pos, order('h-price', 'NEW', [{ ...item('pizza', 'PENDING', 300), lineTotal: 300 }], { subtotal: 350, totalAmount: 350 }));
      expect(res.body.results[0].status).toBe('ok'); // an offline device on an older menu is legitimate
      const o = await row('h-price');
      expect((o.meta as any).reviewFlags.join(' ')).toContain('BELOW_MENU_PRICE:pizza');
      expect((o.meta as any).reviewFlags.join(' ')).toContain('SUBTOTAL_MISMATCH');
      expect((await conflicts('h-price')).some((c) => c.reason.startsWith('PRICE_REVIEW'))).toBe(true);
    });

    it('the originating device is remembered even after other devices update the order', async () => {
      await push(F.pos, order('h-origin', 'NEW'));
      await push(F.kds1, order('h-origin', 'PREPARING', [item('i1', 'PREPARING')]));
      const o = await row('h-origin');
      const posDev = await prisma.runAsPlatform((tx) => tx.device.findFirstOrThrow({ where: { restaurantId: F.rid, name: 'POS-01' } }));
      expect((o.meta as any).originDeviceId).toBe(posDev.id);
      expect(o.deviceId).not.toBe(posDev.id); // last writer, as before
    });
  });

  describe('two kitchens on one order', () => {
    it('KDS-Kitchen and KDS-Bar each advance their own items; nothing is lost, order state stays forward', async () => {
      await push(F.pos, order('h-two', 'NEW', [item('food'), item('drink')]));
      const both1 = (await as('get', '/api/v1/orders/sync?afterSeq=0', F.kds1)).body.orders.map((o: any) => o.externalOrderId);
      const both2 = (await as('get', '/api/v1/orders/sync?afterSeq=0', F.kds2)).body.orders.map((o: any) => o.externalOrderId);
      expect(both1).toContain('h-two');
      expect(both2).toContain('h-two'); // every KDS of a branch receives the branch's orders; each filters its own station locally
      await Promise.all([
        push(F.kds1, order('h-two', 'PREPARING', [item('food', 'READY'), item('drink')])),
        push(F.kds2, order('h-two', 'PREPARING', [item('food'), item('drink', 'READY')]))
      ]);
      const o = await row('h-two');
      const byId = Object.fromEntries((o.items as any[]).map((i) => [i.externalItemId, i.kitchenStatus]));
      expect(byId).toEqual({ food: 'READY', drink: 'READY' });
      expect(o.status).toBe('PREPARING');
    });
  });

  describe('terminal identity', () => {
    it('re-binding a terminal revokes the old record, reuses its seat, and the old credential stops working', async () => {
      const p = await platform('post', '/api/v1/plans').send({ tier: 'CORE', name: `TEST Rebind Plan ${stamp}`, priceMonthly: 500000, maxBranches: 2, maxDevices: 1, maxUsers: 5, entitlements: { posTerminal: true } });
      planIds.push(p.body.id);
      const r = await platform('post', '/api/v1/restaurants').send({ name: `TEST Rebind ${stamp}`, ownerName: 'Owner', ownerEmail: `rebind-${stamp}@test.example.com` });
      const rid = r.body.restaurant.id as string;
      restaurantIds.push(rid);
      await platform('post', '/api/v1/subscriptions').send({ restaurantId: rid, planId: p.body.id, status: 'ACTIVE', expiresAt: inDays(30) });
      const first = await redeem(rid, 'POS', { label: 'Counter 1' });
      expect(first.status).toBe(201);
      // the seat is full: a NEW terminal is refused, but a REPLACEMENT is not
      expect((await redeem(rid, 'POS', { label: 'Counter 2' })).status).toBe(409);
      expect((await as('get', '/api/v1/orders/sync?afterSeq=0', first.token)).status).toBe(200);
      const again = await redeem(rid, 'POS', { replacesDeviceId: first.device.id });
      expect(again.status, JSON.stringify(again.body)).toBe(201);
      expect(again.device.name).toBe('Counter 1'); // inherits name and branch
      expect((await as('get', '/api/v1/orders/sync?afterSeq=0', first.token)).status).toBe(401); // old credential dead
      expect((await as('get', '/api/v1/orders/sync?afterSeq=0', again.token)).status).toBe(200);
      const live = await prisma.runAsPlatform((tx) => tx.device.count({ where: { restaurantId: rid, type: 'POS', status: { not: 'REVOKED' } } }));
      expect(live).toBe(1);
      // wrong type, another restaurant's device
      expect((await key(rid, 'KDS', { replacesDeviceId: again.device.id })).status).toBe(400);
      expect((await key(F.rid, 'POS', { replacesDeviceId: again.device.id })).status).toBe(404);
    });

    it('two live terminals or pending keys cannot share a name within a branch', async () => {
      expect((await key(F.rid, 'POS', { branchId: F.brA, label: 'POS-01' })).status).toBe(409); // a live terminal has it
      const k1 = await key(F.rid, 'POS', { branchId: F.brA, label: 'Pending-9' });
      expect(k1.status).toBe(201);
      expect((await key(F.rid, 'POS', { branchId: F.brA, label: 'Pending-9' })).status).toBe(409);
      expect((await key(F.rid, 'POS', { branchId: F.brB, label: 'Pending-9' })).status).toBe(201); // another branch may reuse it
    });
  });

  describe('floor plan belongs to a branch', () => {
    it('a table pushed by a branch terminal is stamped with its branch, other branches never receive it, unbranded tables are shared', async () => {
      const t = (id: string, extra = {}) => ({ events: [{ externalId: id, payload: { id, tableNumber: id, capacity: 2, status: 'AVAILABLE', isActive: true, updatedAt: now(), ...extra } }] });
      await as('post', '/api/v1/entity-sync/DINING_TABLE', F.pos).send(t('tA1'));
      await as('post', '/api/v1/entity-sync/DINING_TABLE', F.posB).send(t('tB1'));
      await prisma.runAsPlatform((tx) => tx.syncedEntity.create({ data: { restaurantId: F.rid, entityType: 'DINING_TABLE', externalId: 'tShared', payload: { id: 'tShared', tableNumber: 'S', capacity: 2, status: 'AVAILABLE', isActive: true, updatedAt: now() } } }));
      const stored = await prisma.runAsPlatform((tx) => tx.syncedEntity.findFirstOrThrow({ where: { restaurantId: F.rid, entityType: 'DINING_TABLE', externalId: 'tA1' } }));
      expect((stored.payload as any).branchId).toBe(F.brA);
      const seenB = (await as('get', '/api/v1/entity-sync/DINING_TABLE', F.posB)).body.entities.map((e: any) => e.externalId);
      expect(seenB).toEqual(expect.arrayContaining(['tB1', 'tShared']));
      expect(seenB).not.toContain('tA1');
      const seenA = (await as('get', '/api/v1/entity-sync/DINING_TABLE', F.captain)).body.entities.map((e: any) => e.externalId);
      expect(seenA).toEqual(expect.arrayContaining(['tA1', 'tShared']));
      expect(seenA).not.toContain('tB1');
    });
  });
});
