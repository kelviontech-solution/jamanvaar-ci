import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { QrRateLimiter } from '../src/modules/qr/qr-rate-limit';

/**
 * The whole ecosystem at once (spec sections 9-13, 41, 51, 52): several restaurants, two branches each, every kind of terminal
 * and the QR channel creating orders simultaneously through the real API and database. Asserted on stored rows, not on responses.
 */
const OPEN = { ipRequestsPerMinute: 1e7, ipFailedLookupsPerMinute: 1e7, tokenRequestsPerMinute: 1e7, tokenOrdersPerMinute: 1e7, sessionOrdersPerMinute: 1e7, orderStatusPerMinute: 1e7 };

describe('ecosystem: every app, every channel, several branches and restaurants at once', () => {
  let app: INestApplication;
  let base = '';
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-eco-${stamp}@example.com`;
  let platformToken: string;
  const restaurantIds: string[] = [];
  const planIds: string[] = [];

  const http = () => request(base);
  const platform = (m: 'get' | 'post', u: string) => http()[m](u).set('Authorization', `Bearer ${platformToken}`);
  const as = (m: 'get' | 'post', u: string, t: string) => http()[m](u).set('Authorization', `Bearer ${t}`);
  const now = () => new Date().toISOString();
  const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString();

  interface Terminal { token: string; id: string; type: string; branchId: string; name: string }
  interface Venue { rid: string; branches: Array<{ id: string; pos: Terminal[]; kiosk: Terminal[]; kds: Terminal[]; captain: Terminal[]; qrToken: string }>; admin: string }

  async function terminal(rid: string, type: string, branchId: string, name: string): Promise<Terminal> {
    const k = await platform('post', '/api/v1/activation-keys').send({ restaurantId: rid, allowedDeviceType: type, branchId, label: name, expiresAt: inDays(1) });
    const r = await http().post('/api/v1/activation/redeem').send({ code: k.body.code, deviceType: type });
    if (r.status !== 201) throw new Error(`redeem ${type} ${name}: ${r.status} ${JSON.stringify(r.body)}`);
    return { token: r.body.deviceToken, id: r.body.device.id, type, branchId, name };
  }

  async function venue(name: string, counts: { pos: number; kiosk: number; kds: number; captain: number }): Promise<Venue> {
    const plan = await platform('post', '/api/v1/plans').send({ tier: 'PRO', name: `TEST Eco ${name} ${stamp}`, priceMonthly: 900000, maxBranches: 5, maxDevices: 80, maxUsers: 50, entitlements: { posTerminal: true, restaurantAdmin: true, kotKdsRouting: true, captainApp: true, selfOrderKiosk: true, qrTableOrdering: true } });
    planIds.push(plan.body.id);
    const r = await platform('post', '/api/v1/restaurants').send({ name: `TEST Eco ${name} ${stamp}`, ownerName: 'Owner', ownerEmail: `eco-${name.toLowerCase()}-${stamp}@test.example.com` });
    const rid = r.body.restaurant.id as string;
    restaurantIds.push(rid);
    await platform('post', '/api/v1/subscriptions').send({ restaurantId: rid, planId: plan.body.id, status: 'ACTIVE', expiresAt: inDays(30) });
    const branchIds: string[] = [];
    for (const [i, code] of ['BA', 'BB'].entries()) branchIds.push((await platform('post', '/api/v1/branches').send({ restaurantId: rid, name: `${name} ${code}`, code: `${name.slice(0, 2).toUpperCase()}${code}` })).body.id);
    const admin = (await terminal(rid, 'POS_ADMIN', branchIds[0], `Admin ${name}`)).token; // console (branch-bound here so its menu/table pushes are simple)
    const push = (type: string, id: string, payload: Record<string, unknown>) => as('post', `/api/v1/entity-sync/${type}`, admin).send({ events: [{ externalId: id, payload: { id, ...payload, updatedAt: now() } }] });
    await push('TAX_GROUP', 'tax5', { name: 'GST 5%', cgstPercent: 2.5, sgstPercent: 2.5, igstPercent: 5, isInclusive: false, isActive: true });
    await push('MENU_CATEGORY', 'mains', { name: 'Mains', isActive: true, sortOrder: 1 });
    for (const [id, price] of [['pizza', 299], ['burger', 149], ['coffee', 99]] as const) await push('MENU_ITEM', id, { categoryId: 'mains', name: id, price, isAvailable: true, taxGroupId: 'tax5', modifierGroupIds: [], sortOrder: 1 });
    const branches: Venue['branches'] = [];
    for (const [bi, bid] of branchIds.entries()) {
      const mk = async (type: string, n: number, tag: string) => Promise.all(Array.from({ length: n }, (_, i) => terminal(rid, type, bid, `${tag}-${bi}${i + 1}`)));
      const [pos, kiosk, kds, captain] = await Promise.all([mk('POS', counts.pos, 'POS'), mk('KIOSK', counts.kiosk, 'KIOSK'), mk('KDS', counts.kds, 'KDS'), mk('CAPTAIN', counts.captain, 'CAP')]);
      await push('DINING_TABLE', `T0${bi + 1}`, { tableNumber: `T0${bi + 1}`, capacity: 4, isActive: true, branchId: bid });
      const gen = await as('post', `/api/v1/restaurant/qr/tables/T0${bi + 1}/generate`, admin).send({ branchId: bid });
      branches.push({ id: bid, pos, kiosk, kds, captain, qrToken: (gen.body.url as string).split('/q/')[1] });
    }
    await as('post', '/api/v1/menu/publish', admin).send({ note: 'eco' });
    return { rid, branches, admin };
  }

  const line = (id: string, price: number, qty = 1) => ({ externalItemId: id, menuItemId: id, name: id, quantity: qty, unitPrice: price * 100, modifiers: [], lineTotal: price * 100 * qty, kitchenStatus: 'PENDING' });
  const orderFor = (id: string, source: string, table: string) => {
    const items = [line('pizza', 299, 1 + (id.length % 2)), line('coffee', 99)];
    const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
    return { eventId: `evt-${id}`, externalOrderId: id, orderType: 'DINE_IN', status: 'NEW', tableId: table, tableLabel: table, items, subtotal, taxAmount: 0, discountAmount: 0, totalAmount: subtotal, updatedAt: now(), meta: { sourceType: source } };
  };

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    base = await app.getUrl();
    prisma = app.get(PrismaService);
    app.get(QrRateLimiter).configure(OPEN);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;
  }, 120_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: restaurantIds } } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: { in: planIds } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('2 restaurants x 2 branches; 5 POS + 5 Kiosk + 2 KDS + 10 Captain per branch plus QR, all creating orders at the same moment', async () => {
    const t0 = Date.now();
    const [A, B] = await Promise.all([venue('EcoA', { pos: 5, kiosk: 5, kds: 2, captain: 10 }), venue('EcoB', { pos: 2, kiosk: 2, kds: 1, captain: 3 })]);
    const setupMs = Date.now() - t0;

    const expected = new Map<string, { rid: string; branchId: string; source: string }>();
    const jobs: Array<Promise<unknown>> = [];
    let n = 0;
    for (const v of [A, B]) {
      for (const b of v.branches) {
        const each = (list: Terminal[], source: string, per = 3) => list.forEach((t) => { for (let k = 0; k < per; k++) {
          const id = `eco-${v.rid.slice(0, 4)}-${source}-${t.name}-${k}-${n++}`;
          expected.set(id, { rid: v.rid, branchId: b.id, source });
          jobs.push(as('post', '/api/v1/orders/sync', t.token).send({ events: [orderFor(id, source, `T0${n % 3}`)] }));
        } });
        each(b.pos, 'POS');
        each(b.kiosk, 'KIOSK');
        each(b.captain, 'CAPTAIN', 2);
        // QR guests at the branch table, in the same instant
        for (let k = 0; k < 6; k++) jobs.push(http().post(`/api/v1/public/qr/${b.qrToken}/orders`).send({ items: [{ itemId: 'burger', quantity: 1, optionIds: [] }], idempotencyKey: `qr-${b.id}-${k}-${stamp}` }).then((r) => { if (r.status === 201) expected.set(r.body.publicOrderId, { rid: v.rid, branchId: b.id, source: 'QR' }); return r; }));
      }
    }
    const t1 = Date.now();
    const results: any[] = await Promise.all(jobs);
    const ms = Date.now() - t1;
    const failed = results.filter((r) => r.status >= 300 || r.body?.results?.some((x: any) => x.status !== 'ok'));
    expect(failed.map((f) => JSON.stringify(f.body).slice(0, 200)), 'every push and every QR order succeeds').toEqual([]);

    // Stored rows, not responses.
    for (const [rid, label] of [[A.rid, 'A'], [B.rid, 'B']] as const) {
      const rows = await prisma.runAsPlatform((tx) => tx.syncedOrder.findMany({ where: { restaurantId: rid } }));
      const mine = [...expected.entries()].filter(([, e]) => e.rid === rid);
      expect(rows.length, `restaurant ${label}: no lost or duplicate orders`).toBe(mine.length);
      expect(new Set(rows.map((r) => r.externalOrderId)).size).toBe(rows.length);
      expect(new Set(rows.map((r) => r.seq)).size, 'sequence numbers are distinct').toBe(rows.length);
      const seqs = rows.map((r) => r.seq as number).sort((a, b) => a - b);
      expect(seqs[seqs.length - 1] - seqs[0], 'sequence numbers are gapless').toBe(rows.length - 1);
      for (const r of rows) {
        const e = r.source === 'QR' ? expected.get(r.publicOrderId!) : expected.get(r.externalOrderId);
        expect(e, `${r.externalOrderId} is one we sent`).toBeTruthy();
        expect(r.restaurantId).toBe(e!.rid);
        expect(r.branchId, 'branch of the terminal that created it').toBe(e!.branchId);
        expect(r.source).toBe(e!.source);
        expect((r.items as any[]).length).toBeGreaterThan(0);
        if (r.source !== 'QR') {
          expect(r.totalAmount).toBe((r.items as any[]).reduce((s, i) => s + i.lineTotal, 0)); // device totals preserved exactly
          expect((r.meta as any).originDeviceId).toBeTruthy();
        } else {
          expect(r.tableLabel).toMatch(/^T0/);
          expect(r.menuVersion).toBeGreaterThan(0);
        }
      }
      // Numbers: QR order numbers within a branch are unique
      const qrNumbers = rows.filter((r) => r.source === 'QR').map((r) => `${r.branchId}:${(r.meta as any).tokenNumber}`);
      expect(new Set(qrNumbers).size).toBe(qrNumbers.length);
    }

    // Every KDS of a branch receives all of that branch's orders (and QR ones), and nothing of the other branch or restaurant.
    for (const v of [A, B]) {
      for (const b of v.branches) {
        const want = [...expected.entries()].filter(([, e]) => e.branchId === b.id).length;
        for (const kds of b.kds) {
          const pulled = (await as('get', '/api/v1/orders/sync?afterSeq=0', kds.token)).body.orders as any[];
          expect(pulled.length, `${kds.name} sees exactly its branch's orders`).toBe(want);
          expect(pulled.every((o) => o.branchId === b.id)).toBe(true);
        }
      }
    }
    console.log(`[load] ecosystem: ${expected.size} orders from ${A.branches.flatMap((b) => [...b.pos, ...b.kiosk, ...b.captain]).length + B.branches.flatMap((b) => [...b.pos, ...b.kiosk, ...b.captain]).length} order-creating terminals + QR in ${ms} ms (setup of both restaurants ${setupMs} ms)`);
  }, 300_000);
});
