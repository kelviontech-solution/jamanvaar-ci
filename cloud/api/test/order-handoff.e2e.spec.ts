import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Orders hand off between every terminal of one restaurant: captain places it, KDS cooks it, POS bills it,
 * Restaurant Admin sees it for analytics; a kiosk order is manageable from admin; and a change made in
 * admin (a dish price) is what the next order is priced at on every terminal. Asserted on what each
 * device actually pulls back, not on the push response.
 */
describe('order handoff across every app of one restaurant', () => {
  let app: INestApplication;
  let base = '';
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-handoff-${stamp}@example.com`;
  let platformToken: string;
  let restaurantId = '';
  let planId = '';
  let branchA = '';
  let branchB = '';
  let consoleToken = '';

  const http = () => request(base);
  const platform = (m: 'get' | 'post', u: string) => http()[m](u).set('Authorization', `Bearer ${platformToken}`);
  const as = (m: 'get' | 'post', u: string, t: string) => http()[m](u).set('Authorization', `Bearer ${t}`);
  const now = () => new Date().toISOString();
  const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString();

  async function terminal(type: string, branchId: string | null, name: string): Promise<string> {
    const k = await platform('post', '/api/v1/activation-keys').send({ restaurantId, allowedDeviceType: type, ...(branchId ? { branchId } : {}), label: name, expiresAt: inDays(1) });
    const r = await http().post('/api/v1/activation/redeem').send({ code: k.body.code, deviceType: type });
    if (r.status !== 201) throw new Error(`redeem ${type} ${name}: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.deviceToken as string;
  }

  const pullOrders = (token: string) => as('get', '/api/v1/orders/sync?afterSeq=0', token);
  const orderIds = (body: any): string[] => (body.orders ?? body.events ?? []).map((o: any) => o.externalOrderId ?? o.payload?.externalOrderId ?? o.id);

  const item = (id: string, price: number) => ({ externalItemId: id, menuItemId: id, name: id, quantity: 1, unitPrice: price * 100, modifiers: [], lineTotal: price * 100, kitchenStatus: 'PENDING' });
  const order = (id: string, source: string, table: string, price = 299) => {
    const items = [item('pizza', price)];
    const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
    return { eventId: `evt-${id}`, externalOrderId: id, orderType: 'DINE_IN', status: 'NEW', tableId: table, tableLabel: table, items, subtotal, taxAmount: 0, discountAmount: 0, totalAmount: subtotal, updatedAt: now(), meta: { sourceType: source } };
  };

  let captain: string;
  let kds: string;
  let pos: string;
  let kiosk: string;
  let admin: string;
  let posB: string;

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    base = await app.getUrl();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;

    const plan = await platform('post', '/api/v1/plans').send({ tier: 'PRO', name: `TEST Handoff ${stamp}`, priceMonthly: 900000, maxBranches: 5, maxDevices: 40, maxUsers: 20, entitlements: { posTerminal: true, restaurantAdmin: true, kotKdsRouting: true, captainApp: true, selfOrderKiosk: true, qrTableOrdering: true } });
    planId = plan.body.id;
    const r = await platform('post', '/api/v1/restaurants').send({ name: `TEST Handoff ${stamp}`, ownerName: 'Owner', ownerEmail: `handoff-${stamp}@test.example.com` });
    restaurantId = r.body.restaurant.id;
    await platform('post', '/api/v1/subscriptions').send({ restaurantId, planId, status: 'ACTIVE', expiresAt: inDays(30) });
    branchA = (await platform('post', '/api/v1/branches').send({ restaurantId, name: 'Handoff A', code: `HA${stamp % 1000}` })).body.id;
    branchB = (await platform('post', '/api/v1/branches').send({ restaurantId, name: 'Handoff B', code: `HB${stamp % 1000}` })).body.id;

    consoleToken = await terminal('POS_ADMIN', branchA, 'Admin');
    captain = await terminal('CAPTAIN', branchA, 'Captain 1');
    kds = await terminal('KDS', branchA, 'KDS 1');
    pos = await terminal('POS', branchA, 'POS 1');
    kiosk = await terminal('KIOSK', branchA, 'Kiosk 1');
    posB = await terminal('POS', branchB, 'POS B');
    admin = consoleToken;
  }, 120_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('a captain order is pulled by KDS, POS and admin of the same branch', async () => {
    const push = await as('post', '/api/v1/orders/sync', captain).send({ events: [order('cap-1', 'CAPTAIN', 'T01')] });
    expect(push.status).toBe(201);
    expect(push.body.results[0].status).toBe('ok');

    for (const [name, token] of [['KDS', kds], ['POS', pos], ['admin', admin]] as const) {
      const pulled = await pullOrders(token);
      expect(pulled.status, `${name} pull`).toBe(200);
      expect(JSON.stringify(pulled.body), `${name} sees the captain order`).toContain('cap-1');
    }
  });

  it('a kiosk order is pulled by the admin console and by the POS that bills it', async () => {
    await as('post', '/api/v1/orders/sync', kiosk).send({ events: [order('kiosk-1', 'KIOSK', 'KIOSK', 199)] });
    for (const [name, token] of [['admin', admin], ['POS', pos]] as const) {
      const pulled = await pullOrders(token);
      expect(JSON.stringify(pulled.body), `${name} sees the kiosk order`).toContain('kiosk-1');
    }
  });

  it('a status change made on KDS reaches POS and admin', async () => {
    const readyEvent = { ...order('cap-1', 'CAPTAIN', 'T01'), eventId: 'evt-cap-1-ready', status: 'PREPARING', updatedAt: now() };
    const r = await as('post', '/api/v1/orders/sync', kds).send({ events: [readyEvent] });
    expect(r.body.results[0].status).toBe('ok');
    for (const [name, token] of [['POS', pos], ['admin', admin]] as const) {
      const pulled = await pullOrders(token);
      expect(JSON.stringify(pulled.body), `${name} sees the KDS status`).toContain('PREPARING');
    }
  });

  it('an order from another branch does not leak into this branch\'s POS', async () => {
    await as('post', '/api/v1/orders/sync', posB).send({ events: [order('b-only-1', 'POS', 'T09')] });
    const pulled = await pullOrders(pos);
    expect(JSON.stringify(pulled.body)).not.toContain('b-only-1');
  });

  it('a dish price changed in admin is what a new captain order is priced at (menu sync is two-way)', async () => {
    const put = await as('post', '/api/v1/entity-sync/MENU_ITEM', admin).send({ events: [{ externalId: 'pizza', payload: { id: 'pizza', name: 'pizza', categoryId: 'mains', price: 349, isAvailable: true, updatedAt: now() } }] });
    expect(put.body.results[0].status).toBe('ok');
    const pulled = await as('get', '/api/v1/entity-sync/MENU_ITEM?afterSeq=0', captain);
    const pizza = (pulled.body.entities ?? []).map((e: any) => e.payload).find((p: any) => p.id === 'pizza');
    expect(pizza?.price).toBe(349);
  });
});
