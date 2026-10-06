import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.REALTIME_RECHECK_MS = '400';

/**
 * Real-time wake-ups: the server tells connected devices "something changed", scoped strictly by the
 * credentials they authenticated with. Devices then pull by cursor, so a missed event is never a lost change.
 */
describe('Realtime stream', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  const stamp = Date.now();
  const adminEmail = `test-rt-${stamp}@example.com`;
  let platformToken: string;
  const restaurantIds: string[] = [];
  const planIds: string[] = [];
  let posA: string;
  let kdsA: string;
  let kdsB: string;
  let kdsBId: string;
  let otherRestaurantKds: string;
  let adminConsole: string;
  let captainA: string;

  const platform = (method: 'get' | 'post' | 'patch', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${platformToken}`);

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

  /** Opens the stream and collects parsed events until closed. */
  function listen(token: string) {
    const events: Array<{ event: string; data: any }> = [];
    const controller = new AbortController();
    let ended = false;
    const done = (async () => {
      const res = await fetch(`${base}/api/v1/realtime/stream`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
      if (!res.ok || !res.body) return res.status;
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      try {
        for (;;) {
          const { value, done: d } = await reader.read();
          if (d) break;
          buf += dec.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const ev = /^event: (.*)$/m.exec(block)?.[1] ?? 'message';
            const data = /^data: (.*)$/m.exec(block)?.[1];
            events.push({ event: ev, data: data ? JSON.parse(data) : null });
          }
        }
      } catch {
        // aborted
      }
      ended = true;
      return 200;
    })();
    return { events, done, close: () => controller.abort(), isEnded: () => ended };
  }
  const until = async (cond: () => boolean, ms = 4000) => {
    const start = Date.now();
    while (!cond()) {
      if (Date.now() - start > ms) throw new Error('timed out waiting for realtime event');
      await new Promise((r) => setTimeout(r, 40));
    }
  };
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    base = (await app.getUrl()).replace('[::1]', 'localhost');
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;

    const rid = await restaurant('Realtime');
    const branchA = (await platform('post', '/api/v1/branches').send({ restaurantId: rid, name: 'Branch RT-A', code: 'RTA' })).body.id;
    const branchB = (await platform('post', '/api/v1/branches').send({ restaurantId: rid, name: 'Branch RT-B', code: 'RTB' })).body.id;
    posA = (await activate(rid, 'POS', branchA)).token;
    captainA = (await activate(rid, 'CAPTAIN', branchA)).token;
    kdsA = (await activate(rid, 'KDS', branchA)).token;
    const b = await activate(rid, 'KDS', branchB);
    kdsB = b.token; kdsBId = b.id;
    adminConsole = (await activate(rid, 'POS_ADMIN')).token;

    const other = await restaurant('RealtimeOther');
    otherRestaurantKds = (await activate(other, 'KDS')).token;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: restaurantIds } } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: { in: planIds } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  const order = (id: string) => ({
    externalOrderId: id, orderType: 'DINE_IN', status: 'NEW',
    items: [{ externalItemId: 'i', name: 'Tea', quantity: 1, unitPrice: 1000, modifiers: [], lineTotal: 1000 }],
    subtotal: 1000, taxAmount: 50, discountAmount: 0, totalAmount: 1050, updatedAt: new Date().toISOString()
  });

  it('rejects an unauthenticated connection', async () => {
    const res = await fetch(`${base}/api/v1/realtime/stream`);
    expect(res.status).toBe(401);
  });

  it('a connected KDS is woken when a POS in its branch syncs an order, and nobody else is', async () => {
    const a = listen(kdsA);
    const b = listen(kdsB);
    const other = listen(otherRestaurantKds);
    await until(() => [a, b, other].every((s) => s.events.some((e) => e.event === 'ready')));

    const push = await request(app.getHttpServer()).post('/api/v1/orders/sync').set('Authorization', `Bearer ${posA}`).send({ events: [order('rt-1')] });
    expect(push.status).toBe(201);

    await until(() => a.events.some((e) => e.event === 'change'));
    const change = a.events.find((e) => e.event === 'change')!;
    expect(change.data).toMatchObject({ kind: 'orders', seq: expect.any(Number) });
    await pause(400);
    expect(b.events.some((e) => e.event === 'change')).toBe(false); // other branch
    expect(other.events.some((e) => e.event === 'change')).toBe(false); // other restaurant
    [a, b, other].forEach((s) => s.close());
  });

  it('a command is delivered only to the device it is for', async () => {
    const a = listen(kdsA);
    const b = listen(kdsB);
    await until(() => [a, b].every((s) => s.events.some((e) => e.event === 'ready')));
    const res = await platform('post', `/api/v1/devices/${kdsBId}/commands`).send({ commandType: 'REQUEST_HEALTH' });
    expect(res.status).toBe(201);
    await until(() => b.events.some((e) => e.event === 'command'));
    await pause(300);
    expect(a.events.some((e) => e.event === 'command')).toBe(false);
    [a, b].forEach((s) => s.close());
  });

  it('a menu publish and an inventory movement wake the restaurant\'s devices', async () => {
    const a = listen(kdsA);
    await until(() => a.events.some((e) => e.event === 'ready'));
    await request(app.getHttpServer()).post('/api/v1/menu/publish').set('Authorization', `Bearer ${adminConsole}`).send({});
    await until(() => a.events.some((e) => e.event === 'change' && e.data.kind === 'menu'));
    await request(app.getHttpServer()).post('/api/v1/inventory/movements').set('Authorization', `Bearer ${adminConsole}`).send({
      movements: [{ movementId: `rt-m-${stamp}`, itemId: 'x', itemName: 'X', type: 'SALE', quantityDelta: -1, unit: 'kg', reason: 'r', occurredAt: new Date().toISOString() }]
    });
    await until(() => a.events.some((e) => e.event === 'change' && e.data.kind === 'inventory'));
    a.close();
  });

  it('a revoked device is disconnected and told why', async () => {
    const b = listen(kdsB);
    await until(() => b.events.some((e) => e.event === 'ready'));
    await platform('patch', `/api/v1/devices/${kdsBId}/revoke`).send({});
    await until(() => b.isEnded() || b.events.some((e) => e.event === 'revoked'), 6000);
    expect(b.events.some((e) => e.event === 'revoked')).toBe(true);
    b.close();
  });
  it('measures Captain creation, committed DB row, KDS delivery and READY returning to Captain and POS', async () => {
    const kitchen = listen(kdsA); const captain = listen(captainA);
    try {
      await until(() => kitchen.events.some((e) => e.event === 'ready') && captain.events.some((e) => e.event === 'ready'));
      const id = `captain-roundtrip-${Date.now()}`;
      const draft = { ...order(id), eventId: `${id}:new`, meta: { sourceType: 'CAPTAIN' } };
      const start = performance.now();
      const pushed = await request(base).post('/api/v1/orders/sync').set('Authorization', `Bearer ${captainA}`).send({ events: [draft] });
      expect(pushed.body.results[0].status).toBe('ok');
      const createMs = performance.now() - start;
      const dbStart = performance.now();
      const stored = await prisma.runAsPlatform((tx) => tx.syncedOrder.findFirstOrThrow({ where: { externalOrderId: id } }));
      expect(stored.items).toHaveLength(1);
      const dbReadMs = performance.now() - dbStart;
      await until(() => kitchen.events.some((e) => e.event === 'change' && e.data.kind === 'orders'));
      const pulled = await request(base).get('/api/v1/orders/sync?afterSeq=0').set('Authorization', `Bearer ${kdsA}`);
      expect(pulled.body.orders.find((o: any) => o.externalOrderId === id)).toMatchObject({ status: 'NEW' });
      const kitchenVisibleMs = performance.now() - start;
      const returnStart = performance.now();
      const update = { ...draft, eventId: `${id}:ready`, baseSyncVersion: pushed.body.results[0].syncVersion, status: 'READY', items: draft.items.map((i) => ({ ...i, kitchenStatus: 'READY' })) };
      const updated = await request(base).post('/api/v1/orders/sync').set('Authorization', `Bearer ${kdsA}`).send({ events: [update] });
      expect(updated.body.results[0].status).toBe('ok');
      await until(() => captain.events.some((e) => e.event === 'change' && e.data.kind === 'orders'));
      for (const token of [captainA, posA]) {
        const res = await request(base).get(`/api/v1/orders/sync?afterSeq=${stored.seq}`).set('Authorization', `Bearer ${token}`);
        expect(res.body.orders.find((o: any) => o.externalOrderId === id)).toMatchObject({ status: 'READY', items: [expect.objectContaining({ kitchenStatus: 'READY' })] });
      }
      console.log('[sync-flow-local]', JSON.stringify({ createMs: Math.round(createMs), dbReadMs: Math.round(dbReadMs), kitchenVisibleMs: Math.round(kitchenVisibleMs), readyReturnMs: Math.round(performance.now() - returnStart) }));
    } finally { kitchen.close(); captain.close(); await Promise.all([kitchen.done, captain.done]); }
  });

});
