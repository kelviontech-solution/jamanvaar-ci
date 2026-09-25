import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Sync redesign, steps 2-3: every pushed event carries an eventId the server applies exactly once
 * (a replayed older event can never overwrite newer state), and pulls use a monotonic per-branch
 * sequence instead of an updatedAt timestamp, so nothing committed out of order is ever skipped.
 */
describe('Order sync: event idempotency and sequence cursor', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-sync-seq-${Date.now()}@example.com`;
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  let posToken: string;
  let kdsToken: string;

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  const orderEvent = (id: string, status: string, eventId?: string) => ({
    ...(eventId ? { eventId } : {}),
    externalOrderId: id,
    orderType: 'DINE_IN',
    status,
    items: [{ externalItemId: 'i1', name: 'Tea', quantity: 1, unitPrice: 1000, modifiers: [], lineTotal: 1000 }],
    subtotal: 1000, taxAmount: 50, discountAmount: 0, totalAmount: 1050,
    updatedAt: new Date().toISOString()
  });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;
    const rest = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST SyncSeq ${Date.now()}`, ownerName: 'Owner', ownerEmail: `syncseq-${Date.now()}@test.example.com`
    });
    restaurantId = rest.body.restaurant.id;
    const plan = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO', name: `TEST SyncSeq Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: {}
    });
    planId = plan.body.id;
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString()
    });
    const mk = async (type: string) => {
      const key = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: type, expiresAt: new Date(Date.now() + 86400000).toISOString() });
      return (await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: type })).body.deviceToken as string;
    };
    posToken = await mk('POS');
    kdsToken = await mk('KDS');
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('applies an event exactly once: a retried push is acknowledged as a duplicate and changes nothing', async () => {
    const evt = orderEvent('idem-1', 'NEW', 'POS-EVT-0001');
    const first = await authed('post', '/api/v1/orders/sync', posToken).send({ events: [evt] });
    expect(first.body.results[0]).toMatchObject({ status: 'ok', syncVersion: 1 });

    const retry = await authed('post', '/api/v1/orders/sync', posToken).send({ events: [evt] });
    expect(retry.body.results[0]).toMatchObject({ status: 'ok', syncVersion: 1, duplicate: true });

    const rows = await prisma.runAsPlatform((tx) => tx.syncedOrder.findMany({ where: { restaurantId, externalOrderId: 'idem-1' } }));
    expect(rows).toHaveLength(1);
    expect(rows[0].syncVersion).toBe(1);
  });

  it('a delayed replay of an older event cannot overwrite newer state', async () => {
    await authed('post', '/api/v1/orders/sync', posToken).send({ events: [orderEvent('idem-2', 'NEW', 'POS-EVT-0100')] });
    await authed('post', '/api/v1/orders/sync', posToken).send({ events: [orderEvent('idem-2', 'READY', 'POS-EVT-0101')] });
    const replay = await authed('post', '/api/v1/orders/sync', posToken).send({ events: [orderEvent('idem-2', 'NEW', 'POS-EVT-0100')] });
    expect(replay.body.results[0].duplicate).toBe(true);
    const row = await prisma.runAsPlatform((tx) => tx.syncedOrder.findFirstOrThrow({ where: { restaurantId, externalOrderId: 'idem-2' } }));
    expect(row.status).toBe('READY');
  });

  it('pull by sequence returns every change after the cursor, in order, and nothing once caught up', async () => {
    const before = await authed('get', '/api/v1/orders/sync?afterSeq=0', kdsToken);
    expect(typeof before.body.latestSeq).toBe('number');
    const cursor = before.body.latestSeq as number;

    await authed('post', '/api/v1/orders/sync', posToken).send({ events: [orderEvent('seq-a', 'NEW', 'POS-EVT-0200'), orderEvent('seq-b', 'NEW', 'POS-EVT-0201')] });

    const delta = await authed('get', `/api/v1/orders/sync?afterSeq=${cursor}`, kdsToken);
    expect(delta.body.orders.map((o: { externalOrderId: string }) => o.externalOrderId)).toEqual(['seq-a', 'seq-b']);
    const seqs = delta.body.orders.map((o: { seq: number }) => o.seq);
    expect(seqs[1]).toBe(seqs[0] + 1);
    expect(delta.body.latestSeq).toBe(seqs[1]);

    const caughtUp = await authed('get', `/api/v1/orders/sync?afterSeq=${delta.body.latestSeq}`, kdsToken);
    expect(caughtUp.body.orders).toHaveLength(0);
  });

  it('an updated order moves to the head of the sequence so a device that already saw it receives the change', async () => {
    const cursor = (await authed('get', '/api/v1/orders/sync?afterSeq=0', kdsToken)).body.latestSeq as number;
    await authed('post', '/api/v1/orders/sync', posToken).send({ events: [orderEvent('seq-a', 'PREPARING', 'POS-EVT-0202')] });
    const delta = await authed('get', `/api/v1/orders/sync?afterSeq=${cursor}`, kdsToken);
    expect(delta.body.orders).toHaveLength(1);
    expect(delta.body.orders[0]).toMatchObject({ externalOrderId: 'seq-a', status: 'PREPARING' });
  });

  it('concurrent pushes each get a distinct sequence number with no gaps', async () => {
    const cursor = (await authed('get', '/api/v1/orders/sync?afterSeq=0', kdsToken)).body.latestSeq as number;
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        authed('post', '/api/v1/orders/sync', posToken).send({ events: [orderEvent(`conc-${i}`, 'NEW', `POS-EVT-03${String(i).padStart(2, '0')}`)] })
      )
    );
    const delta = await authed('get', `/api/v1/orders/sync?afterSeq=${cursor}`, kdsToken);
    const seqs: number[] = delta.body.orders.map((o: { seq: number }) => o.seq);
    expect(seqs).toHaveLength(12);
    expect(new Set(seqs).size).toBe(12);
    expect(seqs[seqs.length - 1] - seqs[0]).toBe(11);
  });

  it('the legacy since= timestamp pull still works for older app versions', async () => {
    const res = await authed('get', `/api/v1/orders/sync?since=${encodeURIComponent(new Date(Date.now() - 3600_000).toISOString())}`, kdsToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.orders)).toBe(true);
  });
});
