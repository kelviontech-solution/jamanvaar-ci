import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Chaos harness: several devices push overlapping, duplicated, reordered and concurrent events, the way a
 * flaky network would deliver them (lost responses become retries; queues flush in any order). Whatever the
 * delivery order, the system must converge to the same correct business state. Seeded, so a failure replays.
 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = Number(process.env.CHAOS_SEED) || 20260925;
const ORDERS = 40;

describe(`Sync chaos (seed ${SEED})`, () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-chaos-${stamp}@example.com`;
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  let pos: string[] = [];
  let kds: string;
  let admin: string;

  const platform = (method: 'get' | 'post', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${platformToken}`);
  const as = (method: 'get' | 'post', url: string, token: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  async function activate(type: string) {
    const key = await platform('post', '/api/v1/activation-keys').send({ restaurantId, allowedDeviceType: type, expiresAt: new Date(Date.now() + 86400000).toISOString() });
    return (await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: type })).body.deviceToken as string;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;
    const rest = await platform('post', '/api/v1/restaurants').send({ name: `TEST Chaos ${stamp}`, ownerName: 'Owner', ownerEmail: `chaos-${stamp}@test.example.com` });
    restaurantId = rest.body.restaurant.id;
    const plan = await platform('post', '/api/v1/plans').send({ tier: 'PRO', name: `TEST Chaos Plan ${stamp}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 30, maxUsers: 20, entitlements: {} });
    planId = plan.body.id;
    await platform('post', '/api/v1/subscriptions').send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
    for (let i = 0; i < 3; i++) pos.push(await activate('POS'));
    kds = await activate('KDS');
    admin = await activate('POS_ADMIN');
  }, 60000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  const item = (id: string, kitchenStatus?: string) => ({ externalItemId: id, name: id, quantity: 1, unitPrice: 1000, modifiers: [], lineTotal: 1000, ...(kitchenStatus ? { kitchenStatus } : {}) });
  const base = (id: string, items: unknown[], extra: Record<string, unknown> = {}) => ({
    externalOrderId: id, orderType: 'DINE_IN', status: 'NEW', items, subtotal: 1000, taxAmount: 50, discountAmount: 0, totalAmount: 1050,
    updatedAt: new Date().toISOString(), ...extra
  });

  it('converges to a correct state under duplicated, reordered and concurrent delivery', async () => {
    const rnd = mulberry32(SEED);
    const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];

    type Send = { token: string; body: Record<string, unknown>; order: string; txn?: string };
    const sends: Send[] = [];
    const payerTxns = new Map<string, Set<string>>();
    let eventNo = 0;
    const ev = (order: string, token: string, body: Record<string, unknown>, txn?: string): Send => ({ token, order, txn, body: { eventId: `CH-${SEED}-${eventNo++}`, ...body } });

    for (let i = 0; i < ORDERS; i++) {
      const id = `chaos-${i}`;
      const creator = pos[i % 3];
      const adder = pos[(i + 1) % 3];
      const payer = pos[(i + 2) % 3];
      const rival = pos[i % 3];
      const events: Send[] = [
        ev(id, creator, base(id, [item(`${id}-a`, 'PENDING')])),
        ev(id, adder, base(id, [item(`${id}-b`, 'PENDING')])),
        ev(id, kds, base(id, [item(`${id}-a`, 'PREPARING')])),
        ev(id, kds, base(id, [item(`${id}-a`, 'READY')])),
        ev(id, payer, base(id, [item(`${id}-a`, 'PENDING')], { status: 'COMPLETED', paymentStatus: 'SUCCESS', paymentMethod: 'CASH', meta: { paymentTransactionId: `TXN-${i}` } }), `TXN-${i}`),
        ev(id, rival, base(id, [item(`${id}-a`, 'PENDING')], { status: 'COMPLETED', paymentStatus: 'SUCCESS', paymentMethod: 'UPI', meta: { paymentTransactionId: `TXN-${i}-RIVAL` } }), `TXN-${i}-RIVAL`)
      ];
      payerTxns.set(id, new Set([`TXN-${i}`, `TXN-${i}-RIVAL`]));
      for (const e of events) {
        const copies = 1 + Math.floor(rnd() * 3); // lost responses -> retries
        for (let c = 0; c < copies; c++) sends.push(e);
      }
    }
    for (let i = sends.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [sends[i], sends[j]] = [sends[j], sends[i]];
    }

    const acceptedTxns = new Map<string, Set<string>>();
    const uniqueApplied = new Set<string>();
    for (let i = 0; i < sends.length; i += 8) {
      const chunk = sends.slice(i, i + 8);
      const responses = await Promise.all(chunk.map((s) => as('post', '/api/v1/orders/sync', s.token).send({ events: [s.body] })));
      responses.forEach((res, k) => {
        expect(res.status).toBe(201);
        const r = res.body.results[0];
        const s = chunk[k];
        if (r.status === 'ok' && !r.duplicate) uniqueApplied.add(String(s.body.eventId));
        if (r.status === 'ok' && s.txn) {
          if (!acceptedTxns.has(s.order)) acceptedTxns.set(s.order, new Set());
          acceptedTxns.get(s.order)!.add(s.txn);
        }
      });
    }

    // Inventory: duplicated, shuffled movements from several devices must sum exactly.
    const movements = Array.from({ length: 60 }, (_, i) => ({
      movementId: `CHM-${SEED}-${i}`, itemId: pick(['flour', 'oil', 'rice']), itemName: 'Stock', type: 'SALE',
      quantityDelta: -Math.round((1 + rnd() * 5) * 100) / 100, unit: 'kg', reason: 'chaos', occurredAt: new Date().toISOString()
    }));
    const expected: Record<string, number> = {};
    movements.forEach((m) => { expected[m.itemId] = Math.round(((expected[m.itemId] ?? 0) + m.quantityDelta) * 1000) / 1000; });
    const invSends = movements.flatMap((m) => Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => m));
    for (let i = invSends.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [invSends[i], invSends[j]] = [invSends[j], invSends[i]];
    }
    for (let i = 0; i < invSends.length; i += 8) {
      const chunk = invSends.slice(i, i + 8);
      await Promise.all(chunk.map((m) => as('post', '/api/v1/inventory/movements', pick([admin, ...pos])).send({ movements: [m] })));
    }

    // ---- Invariants ----
    const rows = await prisma.runAsPlatform((tx) => tx.syncedOrder.findMany({ where: { restaurantId, externalOrderId: { startsWith: 'chaos-' } } }));
    // 1. one order per id, no duplicates.
    expect(rows).toHaveLength(ORDERS);
    expect(new Set(rows.map((r) => r.externalOrderId)).size).toBe(ORDERS);

    for (const row of rows) {
      const items = row.items as Array<{ externalItemId: string; kitchenStatus?: string }>;
      // 2. no item lost: both devices' items are present.
      expect(items.map((i) => i.externalItemId).sort(), row.externalOrderId).toEqual([`${row.externalOrderId}-a`, `${row.externalOrderId}-b`]);
      // 3. the kitchen's progress was never undone by a stale copy.
      expect(items.find((i) => i.externalItemId.endsWith('-a'))!.kitchenStatus, row.externalOrderId).toBe('READY');
      // 4. exactly one payment won, and it is the one stored.
      const stored = (row.meta as { paymentTransactionId?: string }).paymentTransactionId!;
      expect(payerTxns.get(row.externalOrderId)!.has(stored)).toBe(true);
      expect(row.paymentStatus).toBe('SUCCESS');
      expect(acceptedTxns.get(row.externalOrderId)!.size, `${row.externalOrderId} accepted two different payments`).toBe(1);
      expect([...acceptedTxns.get(row.externalOrderId)!][0]).toBe(stored);
    }

    // 5. the sequence numbers are unique, so a pull never confuses two changes.
    const seqs = rows.map((r) => r.seq);
    expect(new Set(seqs).size).toBe(ORDERS);

    // 6. a fresh device catching up from zero receives every order exactly once.
    const pulled: string[] = [];
    let cursor = 0;
    for (let page = 0; page < 20; page++) {
      const res = await as('get', `/api/v1/orders/sync?afterSeq=${cursor}`, kds);
      pulled.push(...res.body.orders.filter((o: { externalOrderId: string }) => o.externalOrderId.startsWith('chaos-')).map((o: { externalOrderId: string }) => o.externalOrderId));
      cursor = res.body.latestSeq;
      if (!res.body.hasMore) break;
    }
    expect(new Set(pulled).size).toBe(ORDERS);
    expect(pulled).toHaveLength(ORDERS);

    // 7. every event id was applied at most once, and stock adds up exactly.
    const processed = await prisma.runAsPlatform((tx) => tx.processedSyncEvent.count({ where: { restaurantId, eventId: { startsWith: `CH-${SEED}-` } } }));
    expect(processed).toBeLessThanOrEqual(eventNo);
    expect(processed).toBeGreaterThanOrEqual(uniqueApplied.size);
    const balances = (await as('get', '/api/v1/inventory/balances', admin)).body as Array<{ itemId: string; netQuantity: number }>;
    for (const [itemId, sum] of Object.entries(expected)) {
      expect(balances.find((b) => b.itemId === itemId)?.netQuantity).toBeCloseTo(sum, 2);
    }
    const dupMovements = await prisma.runAsPlatform((tx) => tx.inventoryMovement.count({ where: { restaurantId, movementId: { startsWith: `CHM-${SEED}-` } } }));
    expect(dupMovements).toBe(movements.length);
  }, 180000);
});
