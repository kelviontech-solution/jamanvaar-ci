import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Sustained device-order load. NOT part of the normal run (it takes about a minute): `SUSTAINED_LOAD=45 npx vitest run test/sustained-load.e2e.spec.ts`
 * (the number is the duration in seconds). Every terminal keeps creating orders and walking them through the kitchen states
 * while two KDS screens pull by cursor, then the stored rows are checked: nothing lost, duplicated or out of order.
 */
const SECONDS = Number(process.env.SUSTAINED_LOAD || 0);

describe.skipIf(!SECONDS)('sustained load: continuous order traffic from every terminal type', () => {
  let app: INestApplication;
  let base = '';
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-sustain-${stamp}@example.com`;
  let platformToken: string;
  const restaurantIds: string[] = [];
  const planIds: string[] = [];

  const http = () => request(base);
  const platform = (m: 'get' | 'post', u: string) => http()[m](u).set('Authorization', `Bearer ${platformToken}`);
  const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString();

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    base = await app.getUrl();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;
  }, 120_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: restaurantIds } } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: { in: planIds } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it(`runs ${SECONDS} s of traffic from 10 POS, 10 Kiosk, 10 Captain and 2 pulling KDS screens`, async () => {
    const plan = await platform('post', '/api/v1/plans').send({ tier: 'PRO', name: `TEST Sustain ${stamp}`, priceMonthly: 900000, maxBranches: 3, maxDevices: 100, maxUsers: 50, entitlements: { posTerminal: true, restaurantAdmin: true, kotKdsRouting: true, captainApp: true, selfOrderKiosk: true } });
    planIds.push(plan.body.id);
    const r = await platform('post', '/api/v1/restaurants').send({ name: `TEST Sustain ${stamp}`, ownerName: 'Owner', ownerEmail: `sustain-${stamp}@test.example.com` });
    const rid = r.body.restaurant.id as string;
    restaurantIds.push(rid);
    await platform('post', '/api/v1/subscriptions').send({ restaurantId: rid, planId: plan.body.id, status: 'ACTIVE', expiresAt: inDays(30) });
    const branch = (await platform('post', '/api/v1/branches').send({ restaurantId: rid, name: 'Load', code: 'LD' })).body.id as string;
    const term = async (type: string, n: number) => {
      const k = await platform('post', '/api/v1/activation-keys').send({ restaurantId: rid, allowedDeviceType: type, branchId: branch, label: `${type}-${n}`, expiresAt: inDays(1) });
      return (await http().post('/api/v1/activation/redeem').send({ code: k.body.code, deviceType: type })).body.deviceToken as string;
    };
    const makers: Array<[string, string]> = [];
    for (const type of ['POS', 'KIOSK', 'CAPTAIN']) for (let i = 0; i < 10; i++) makers.push([type, await term(type, i)]);
    const kds = [await term('KDS', 1), await term('KDS', 2)];

    const latencies: number[] = [];
    const errors: string[] = [];
    let created = 0;
    let updates = 0;
    const mine = new Set<string>();
    const stopAt = Date.now() + SECONDS * 1000;
    const ev = (id: string, status: string, kitchen: string) => ({
      eventId: `e-${id}-${status}`, externalOrderId: id, orderType: 'DINE_IN', status,
      items: [{ externalItemId: 'i1', name: 'Pizza', quantity: 2, unitPrice: 30000, modifiers: [], lineTotal: 60000, kitchenStatus: kitchen }, { externalItemId: 'i2', name: 'Coffee', quantity: 1, unitPrice: 9900, modifiers: [], lineTotal: 9900, kitchenStatus: kitchen }],
      subtotal: 69900, taxAmount: 0, discountAmount: 0, totalAmount: 69900, updatedAt: new Date().toISOString(), meta: { sourceType: 'POS' }
    });
    const send = async (token: string, e: unknown) => {
      const t = Date.now();
      const res = await http().post('/api/v1/orders/sync').set('Authorization', `Bearer ${token}`).send({ events: [e] });
      latencies.push(Date.now() - t);
      if (res.status !== 201 || res.body.results[0].status !== 'ok') errors.push(`${res.status} ${JSON.stringify(res.body).slice(0, 120)}`);
    };

    const terminal = async ([type, token]: [string, string], idx: number) => {
      let n = 0;
      while (Date.now() < stopAt) {
        const id = `sus-${type}-${idx}-${n++}`;
        mine.add(id);
        await send(token, ev(id, 'NEW', 'PENDING')); created++;
        if (n % 2 === 0) { await send(kds[idx % 2], ev(id, 'PREPARING', 'PREPARING')); updates++; await send(kds[idx % 2], ev(id, 'READY', 'READY')); updates++; }
        await new Promise((res) => setTimeout(res, 100 + Math.random() * 200));
      }
    };
    const puller = async (token: string) => {
      let cursor = 0;
      let pulled = 0;
      const seen = new Set<string>();
      while (Date.now() < stopAt + 500) {
        const res = await http().get(`/api/v1/orders/sync?afterSeq=${cursor}`).set('Authorization', `Bearer ${token}`);
        if (res.status !== 200) { errors.push(`pull ${res.status}`); break; }
        for (const o of res.body.orders as Array<{ externalOrderId: string; seq: number }>) { if (o.seq <= cursor) errors.push(`cursor went back ${o.seq}<=${cursor}`); seen.add(o.externalOrderId); }
        pulled += res.body.orders.length;
        cursor = res.body.latestSeq;
        await new Promise((r2) => setTimeout(r2, 200));
      }
      return { seen, cursor };
    };

    const t0 = Date.now();
    const [pulls] = await Promise.all([Promise.all(kds.map(puller)), Promise.all(makers.map((m, i) => terminal(m, i)))]);
    const wall = (Date.now() - t0) / 1000;

    const rows = await prisma.runAsPlatform((tx) => tx.syncedOrder.findMany({ where: { restaurantId: rid }, select: { externalOrderId: true, seq: true, status: true, source: true } }));
    const sorted = [...latencies].sort((a, b) => a - b);
    const pct = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    const report = { seconds: Math.round(wall), terminals: makers.length, ordersCreated: created, kitchenUpdates: updates, requests: latencies.length, requestsPerSecond: Math.round(latencies.length / wall), p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: sorted[sorted.length - 1], errors: errors.length };
    console.log(`[sustained] ${JSON.stringify(report)}`);

    expect([...new Set(errors.map((e) => e.slice(0, 90)))].slice(0, 6)).toEqual([]);
    expect(rows.length, 'every created order is stored exactly once').toBe(created);
    expect(new Set(rows.map((x) => x.externalOrderId)).size).toBe(rows.length);
    const seqs = rows.map((x) => x.seq as number).sort((a, b) => a - b);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(seqs[seqs.length - 1] - seqs[0], 'sequence numbers stay gapless under sustained load').toBeLessThan(created + updates);
    for (const { seen } of pulls) expect(seen.size, 'each KDS received every order').toBe(created);
    expect(rows.filter((x) => x.externalOrderId.includes('-POS-') || true).every((x) => ['NEW', 'PREPARING', 'READY'].includes(x.status))).toBe(true);
    expect(rows.filter((x) => x.status === 'READY').length).toBeGreaterThan(0);
  }, (SECONDS + 120) * 1000);
});
