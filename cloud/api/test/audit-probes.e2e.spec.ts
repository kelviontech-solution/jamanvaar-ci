import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * ARCHITECTURE-AUDIT PROBES (docs/RESTAURANT_ONBOARDING_MULTI_APP_TEST_REPORT.md).
 *
 * Each probe asserts the behaviour the onboarding specification REQUIRES. `it.fails` marks a probe whose requirement the
 * current code does NOT meet: the test passes while the defect exists and turns red the day it is fixed, at which point
 * `.fails` is removed and it becomes an ordinary regression test. A plain `it` is a requirement the code already meets.
 */
describe('audit probes: onboarding, devices, branches, concurrency', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-audit-${stamp}@example.com`;
  let platformToken: string;
  const restaurantIds: string[] = [];
  const planIds: string[] = [];
  const F: Record<string, any> = {};

  const http = () => request(app.getHttpServer());
  const platform = (m: 'get' | 'post' | 'patch', u: string) => http()[m](u).set('Authorization', `Bearer ${platformToken}`);
  const as = (m: 'get' | 'post' | 'put', u: string, t: string) => http()[m](u).set('Authorization', `Bearer ${t}`);
  const now = () => new Date().toISOString();
  const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString();

  async function plan(extra: Record<string, unknown> = {}) {
    const r = await platform('post', '/api/v1/plans').send({ tier: 'PRO', name: `TEST Audit Plan ${stamp} ${Math.random()}`, priceMonthly: 700000, maxBranches: 5, maxDevices: 20, maxUsers: 20, entitlements: { posTerminal: true, restaurantAdmin: true, kotKdsRouting: true }, ...extra });
    planIds.push(r.body.id);
    return r.body.id as string;
  }
  async function restaurant(name: string, planId: string) {
    const r = await platform('post', '/api/v1/restaurants').send({ name: `TEST ${name} ${stamp}`, ownerName: 'Owner', ownerEmail: `${name.toLowerCase()}-${stamp}@test.example.com` });
    if (!r.body.restaurant) throw new Error('restaurant create failed: ' + r.status + ' ' + JSON.stringify(r.body));
    const id = r.body.restaurant.id as string;
    restaurantIds.push(id);
    await platform('post', '/api/v1/subscriptions').send({ restaurantId: id, planId, status: 'ACTIVE', expiresAt: inDays(30) });
    return id;
  }
  const key = (rid: string, type: string, branchId?: string) =>
    platform('post', '/api/v1/activation-keys').send({ restaurantId: rid, allowedDeviceType: type, ...(branchId ? { branchId } : {}), expiresAt: inDays(1) });
  async function redeem(rid: string, type: string, branchId?: string) {
    const k = await key(rid, type, branchId);
    const r = await http().post('/api/v1/activation/redeem').send({ code: k.body.code, deviceType: type });
    return { status: r.status, token: r.body.deviceToken as string | undefined, device: r.body.device };
  }
  const order = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
    eventId: `evt-${id}-${status}-${Math.random().toString(36).slice(2)}`, externalOrderId: id, orderType: 'DINE_IN', status,
    items: [{ externalItemId: 'i1', name: 'Tea', quantity: 1, unitPrice: 1000, modifiers: [], lineTotal: 1000 }],
    subtotal: 1000, taxAmount: 50, discountAmount: 0, totalAmount: 1050, updatedAt: now(), ...extra
  });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;
    F.plan = await plan();
    F.rid = await restaurant('AuditA', F.plan);
    F.brA = (await platform('post', '/api/v1/branches').send({ restaurantId: F.rid, name: 'A1', code: 'AA1' })).body.id;
    F.brB = (await platform('post', '/api/v1/branches').send({ restaurantId: F.rid, name: 'A2', code: 'AA2' })).body.id;
    F.posA = (await redeem(F.rid, 'POS', F.brA)).token;
    F.posB = (await redeem(F.rid, 'POS', F.brB)).token;
    F.kdsA = (await redeem(F.rid, 'KDS', F.brA)).token;
    F.kdsB = (await redeem(F.rid, 'KDS', F.brB)).token;
  }, 120_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: restaurantIds } } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: { in: planIds } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  // ------------------------------------------------------------------ requirements the code MEETS (verified)

  it('P-OK-1 (spec 5/6/36): devices of one restaurant get distinct server ids, the same restaurantId and their own branch', async () => {
    const rows = await prisma.runAsPlatform((tx) => tx.device.findMany({ where: { restaurantId: F.rid } }));
    expect(new Set(rows.map((d) => d.id)).size).toBe(rows.length);
    expect(rows.every((d) => d.restaurantId === F.rid)).toBe(true);
    expect(rows.filter((d) => d.branchId === F.brA).map((d) => d.type).sort()).toEqual(['KDS', 'POS']);
    expect(rows.filter((d) => d.branchId === F.brB).map((d) => d.type).sort()).toEqual(['KDS', 'POS']);
  });

  it('P-OK-2 (spec 41): a Branch A order reaches Branch A KDS and never Branch B KDS', async () => {
    await as('post', '/api/v1/orders/sync', F.posA).send({ events: [order('probe-brA-1', 'NEW')] });
    const a = (await as('get', '/api/v1/orders/sync?afterSeq=0', F.kdsA)).body.orders.map((o: any) => o.externalOrderId);
    const b = (await as('get', '/api/v1/orders/sync?afterSeq=0', F.kdsB)).body.orders.map((o: any) => o.externalOrderId);
    expect(a).toContain('probe-brA-1');
    expect(b).not.toContain('probe-brA-1');
  });

  it('P-OK-3 (spec 9/11/12): 3 terminals of different types creating orders at once all land once, with distinct sequence numbers', async () => {
    const posA2 = (await redeem(F.rid, 'POS', F.brA)).token!;
    const results = await Promise.all([F.posA, posA2, F.kdsA].map((t, i) => as('post', '/api/v1/orders/sync', t).send({ events: [order(`probe-conc-${i}`, 'NEW')] })));
    expect(results.every((r) => r.body.results[0].status === 'ok')).toBe(true);
    const rows = await prisma.runAsPlatform((tx) => tx.syncedOrder.findMany({ where: { restaurantId: F.rid, externalOrderId: { startsWith: 'probe-conc-' } } }));
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.seq)).size).toBe(3);
  });

  it('P-OK-4 (spec 20): item-level kitchen progress cannot regress from a stale item push', async () => {
    const withItem = (st: string) => order('probe-kitchen', 'PREPARING', { items: [{ externalItemId: 'i1', name: 'Tea', quantity: 1, unitPrice: 1000, modifiers: [], lineTotal: 1000, kitchenStatus: st }] });
    await as('post', '/api/v1/orders/sync', F.kdsA).send({ events: [withItem('READY')] });
    await as('post', '/api/v1/orders/sync', F.posA).send({ events: [withItem('PREPARING')] });
    const row = await prisma.runAsPlatform((tx) => tx.syncedOrder.findFirstOrThrow({ where: { restaurantId: F.rid, externalOrderId: 'probe-kitchen' } }));
    expect((row.items as any[])[0].kitchenStatus).toBe('READY');
  });

  // Onboarding matrix CASE 01-09 (spec 8): a CORE-tier plan whose feature flags name the combination. The applications each
  // restaurant is actually entitled to are read back through the Super Admin API and compared with the case's expectation.
  const CASES: Array<[string, string[], string[]]> = [
    ['CASE01 POS', ['posTerminal', 'restaurantAdmin'], ['POS', 'POS_ADMIN']],
    ['CASE02 POS+KDS', ['posTerminal', 'restaurantAdmin', 'kotKdsRouting'], ['POS', 'POS_ADMIN', 'KDS']],
    ['CASE03 POS+Captain', ['posTerminal', 'restaurantAdmin', 'captainApp'], ['POS', 'POS_ADMIN', 'CAPTAIN']],
    ['CASE04 POS+KDS+Captain', ['posTerminal', 'restaurantAdmin', 'kotKdsRouting', 'captainApp'], ['POS', 'POS_ADMIN', 'KDS', 'CAPTAIN']],
    ['CASE05 POS+Kiosk', ['posTerminal', 'restaurantAdmin', 'selfOrderKiosk'], ['POS', 'POS_ADMIN', 'KIOSK', 'KIOSK_ADMIN']],
    ['CASE06 POS+Kiosk+KDS', ['posTerminal', 'restaurantAdmin', 'selfOrderKiosk', 'kotKdsRouting'], ['POS', 'POS_ADMIN', 'KIOSK', 'KIOSK_ADMIN', 'KDS']],
    ['CASE07 POS+Kiosk+Captain+KDS', ['posTerminal', 'restaurantAdmin', 'selfOrderKiosk', 'kotKdsRouting', 'captainApp'], ['POS', 'POS_ADMIN', 'KIOSK', 'KIOSK_ADMIN', 'KDS', 'CAPTAIN']],
    ['CASE08 POS+Kiosk+QR+KDS', ['posTerminal', 'restaurantAdmin', 'selfOrderKiosk', 'kotKdsRouting', 'qrTableOrdering'], ['POS', 'POS_ADMIN', 'KIOSK', 'KIOSK_ADMIN', 'KDS', 'QR_ORDERING']],
    ['CASE09 full', ['posTerminal', 'restaurantAdmin', 'selfOrderKiosk', 'kotKdsRouting', 'captainApp', 'qrTableOrdering'], ['POS', 'POS_ADMIN', 'KIOSK', 'KIOSK_ADMIN', 'KDS', 'CAPTAIN', 'QR_ORDERING']]
  ];
  for (const [name, flags, expected] of CASES) {
    it(`P-OK-5 ${name}: exactly the expected applications are entitled, and a device of any other type cannot be activated`, async () => {
      const p = await plan({ tier: 'CORE', entitlements: Object.fromEntries(flags.map((f) => [f, true])) });
      const rid = await restaurant(`Audit${name.slice(0, 6)}`, p);
      const apps = (await platform('get', `/api/v1/restaurants/${rid}/applications`)).body as Array<{ appCode: string; enabled: boolean }>;
      expect(apps.filter((a) => a.enabled).map((a) => a.appCode).sort()).toEqual([...expected].sort());
      const all = ['POS', 'CAPTAIN', 'KDS', 'KIOSK'];
      for (const type of all) {
        const k = await key(rid, type);
        expect(k.status === 201, `${name}: key for ${type}`).toBe(expected.includes(type));
      }
    }, 60_000);
  }

  // ------------------------------------------------------------------ requirements the code does NOT meet (defects confirmed by these probes)

  it('P-FIXED-1 (spec 20/21): the ORDER-level status cannot regress (READY, then a stale PREPARING with a fresh eventId)', async () => {
    await as('post', '/api/v1/orders/sync', F.posA).send({ events: [order('probe-status', 'NEW')] });
    await as('post', '/api/v1/orders/sync', F.kdsA).send({ events: [order('probe-status', 'READY')] });
    await as('post', '/api/v1/orders/sync', F.posA).send({ events: [order('probe-status', 'PREPARING', { updatedAt: new Date(Date.now() - 60000).toISOString() })] });
    const row = await prisma.runAsPlatform((tx) => tx.syncedOrder.findFirstOrThrow({ where: { restaurantId: F.rid, externalOrderId: 'probe-status' } }));
    expect(row.status).toBe('READY');
  });

  it('P-FIXED-2 (spec 32): concurrent activations cannot exceed the device quota', async () => {
    const p = await plan({ maxDevices: 2 });
    const rid = await restaurant('AuditQuota', p);
    const keys = await Promise.all(Array.from({ length: 6 }, () => key(rid, 'POS')));
    await Promise.all(keys.map((k) => http().post('/api/v1/activation/redeem').send({ code: k.body.code, deviceType: 'POS' })));
    const active = await prisma.runAsPlatform((tx) => tx.device.count({ where: { restaurantId: rid, type: 'POS', status: { not: 'REVOKED' } } }));
    expect(active).toBeLessThanOrEqual(2);
  });

  it('P-FIXED-3 (spec 36/41): a device cannot be activated without a branch in a restaurant that has several active branches', async () => {
    const r = await redeem(F.rid, 'POS'); // key has no branch; the restaurant has two active branches
    expect(r.status).not.toBe(201);
  });

  it('P-FIXED-4 (spec 36): only an admin console may be restaurant-wide; a branch terminal never sees another branch orders', async () => {
    const admin = await redeem(F.rid, 'POS_ADMIN'); // no branch: allowed for a console
    expect(admin.status).toBe(201);
    expect(admin.device.branchId).toBeNull();
    const consoleSees = (await as('get', '/api/v1/orders/sync?afterSeq=0', admin.token!)).body.orders.map((o: any) => o.externalOrderId);
    expect(consoleSees).toContain('probe-brA-1');
    const branchB = (await as('get', '/api/v1/orders/sync?afterSeq=0', F.posB)).body.orders.map((o: any) => o.externalOrderId);
    expect(branchB).not.toContain('probe-brA-1');
    expect((await redeem(F.rid, 'KIOSK')).status).not.toBe(201); // and a kiosk terminal is a branch terminal
  });

  it('P-FIXED-5 (spec 36/41): Branch B cannot pull Branch A\'s tables through entity sync', async () => {
    await as('post', '/api/v1/entity-sync/DINING_TABLE', F.posA).send({ events: [{ externalId: 'probe-tblA', payload: { id: 'probe-tblA', tableNumber: 'A-9', capacity: 2, status: 'AVAILABLE', isActive: true, branchId: F.brA, updatedAt: now() } }] });
    const pulled = await as('get', '/api/v1/entity-sync/DINING_TABLE', F.posB);
    expect(JSON.stringify(pulled.body)).not.toContain('A-9');
  });

  it('P-FIXED-6 (spec 34/31): Restaurant Admin sees the applications of EVERY active subscription (Restaurant + Kiosk family)', async () => {
    const kp = await plan({ productFamily: 'KIOSK', tier: 'CORE', maxDevices: 3, entitlements: {} });
    const rp = await plan();
    const rid = await restaurant('AuditFamily', rp);
    await platform('post', '/api/v1/subscriptions').send({ restaurantId: rid, planId: kp, status: 'ACTIVE', expiresAt: inDays(30) });
    const res = await platform('get', `/api/v1/restaurants/${rid}/applications`);
    const enabled = (res.body as Array<{ appCode: string; enabled: boolean }>).filter((a) => a.enabled).map((a) => a.appCode);
    expect(enabled).toEqual(expect.arrayContaining(['POS', 'KIOSK']));
  });
});
