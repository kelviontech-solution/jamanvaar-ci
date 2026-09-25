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
  let pos2Token: string;
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
    pos2Token = await mk('POS');
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

  const paid = (id: string, txn: string, status = 'SUCCESS') => ({
    ...orderEvent(id, 'COMPLETED'),
    paymentStatus: status,
    paymentMethod: 'CASH',
    meta: { paymentTransactionId: txn }
  });

  it('a second terminal cannot pay an already-paid order (ORDER_ALREADY_PAID), and the attempt is recorded', async () => {
    const first = await authed('post', '/api/v1/orders/sync', posToken).send({ events: [paid('pay-1', 'TXN-A')] });
    expect(first.body.results[0].status).toBe('ok');

    const second = await authed('post', '/api/v1/orders/sync', pos2Token).send({ events: [paid('pay-1', 'TXN-B')] });
    expect(second.body.results[0]).toMatchObject({ status: 'error', error: expect.stringContaining('ORDER_ALREADY_PAID') });

    const row = await prisma.runAsPlatform((tx) => tx.syncedOrder.findFirstOrThrow({ where: { restaurantId, externalOrderId: 'pay-1' } }));
    expect((row.meta as { paymentTransactionId?: string }).paymentTransactionId).toBe('TXN-A');
    const conflicts = await prisma.runAsPlatform((tx) => tx.syncConflict.count({ where: { restaurantId, entityId: 'pay-1' } }));
    expect(conflicts).toBeGreaterThanOrEqual(1);
  });

  it('re-sending the same payment (same transaction) is not a conflict', async () => {
    await authed('post', '/api/v1/orders/sync', posToken).send({ events: [paid('pay-2', 'TXN-C')] });
    const again = await authed('post', '/api/v1/orders/sync', pos2Token).send({ events: [paid('pay-2', 'TXN-C')] });
    expect(again.body.results[0].status).toBe('ok');
  });

  it('a paid order can be refunded but can never revert to unpaid', async () => {
    await authed('post', '/api/v1/orders/sync', posToken).send({ events: [paid('pay-3', 'TXN-D')] });
    const revert = await authed('post', '/api/v1/orders/sync', posToken).send({ events: [paid('pay-3', 'TXN-D', 'PENDING')] });
    expect(revert.body.results[0].status).toBe('error');
    const refund = await authed('post', '/api/v1/orders/sync', posToken).send({ events: [paid('pay-3', 'TXN-D', 'REFUNDED')] });
    expect(refund.body.results[0].status).toBe('ok');
  });

  const withItems = (id: string, items: Array<{ id: string; kitchenStatus?: string }>) => ({
    ...orderEvent(id, 'NEW'),
    items: items.map((i) => ({ externalItemId: i.id, name: i.id, quantity: 1, unitPrice: 1000, modifiers: [], lineTotal: 1000, ...(i.kitchenStatus ? { kitchenStatus: i.kitchenStatus } : {}) }))
  });
  const storedItems = async (id: string) => {
    const row = await prisma.runAsPlatform((tx) => tx.syncedOrder.findFirstOrThrow({ where: { restaurantId, externalOrderId: id } }));
    return { items: row.items as Array<{ externalItemId: string; kitchenStatus?: string; originDeviceId?: string }>, meta: row.meta as { needsTotalsReview?: boolean } | null };
  };

  it('two terminals adding to the same order keep each others items, and the order is flagged for totals review', async () => {
    await authed('post', '/api/v1/orders/sync', posToken).send({ events: [withItems('merge-1', [{ id: 'a' }])] });
    await authed('post', '/api/v1/orders/sync', pos2Token).send({ events: [withItems('merge-1', [{ id: 'c' }])] });
    const { items, meta } = await storedItems('merge-1');
    expect(items.map((i) => i.externalItemId).sort()).toEqual(['a', 'c']);
    expect(new Set(items.map((i) => i.originDeviceId)).size).toBe(2);
    expect(meta?.needsTotalsReview).toBe(true);
  });

  it('a stale push cannot move a dish backwards once the kitchen has advanced it', async () => {
    await authed('post', '/api/v1/orders/sync', posToken).send({ events: [withItems('merge-2', [{ id: 'a', kitchenStatus: 'PENDING' }])] });
    await authed('post', '/api/v1/orders/sync', kdsToken).send({ events: [withItems('merge-2', [{ id: 'a', kitchenStatus: 'READY' }])] });
    await authed('post', '/api/v1/orders/sync', posToken).send({ events: [withItems('merge-2', [{ id: 'a', kitchenStatus: 'PENDING' }])] });
    const { items } = await storedItems('merge-2');
    expect(items[0].kitchenStatus).toBe('READY');
  });

  it('the device that added an item can remove it', async () => {
    await authed('post', '/api/v1/orders/sync', posToken).send({ events: [withItems('merge-3', [{ id: 'a' }, { id: 'b' }])] });
    await authed('post', '/api/v1/orders/sync', posToken).send({ events: [withItems('merge-3', [{ id: 'a' }])] });
    expect((await storedItems('merge-3')).items.map((i) => i.externalItemId)).toEqual(['a']);
  });
});
