import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Covers the two P0 gaps the QA audit found had no real mechanism at all:
 * (1) no order source ever reached KDS/Captain because the sync outbox was a
 * stub that faked success without a network call, and (2) suspending a
 * restaurant in Super Admin flipped a database flag nothing downstream ever
 * checked, so a non-paying tenant's terminals kept working indefinitely.
 */
describe('Order sync bridge + suspension enforcement', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-order-sync-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  let subscriptionId: string;
  let posToken: string;
  let kdsToken: string;

  const authed = (method: 'get' | 'post' | 'patch', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await platformLogin(app, adminEmail, adminPassword);
    platformToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Order Sync Restaurant ${Date.now()}`,
      ownerName: 'Order Sync Owner',
      ownerEmail: `order-sync-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;

    const planRes = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO', name: `TEST Order Sync Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { posTerminal: true, kotKdsRouting: true }
    });
    planId = planRes.body.id;
    const subRes = await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
    subscriptionId = subRes.body.id;

    const posKeyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const posRedeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: posKeyRes.body.code, deviceType: 'POS' });
    posToken = posRedeemRes.body.deviceToken;

    const kdsKeyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'KDS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const kdsRedeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: kdsKeyRes.body.code, deviceType: 'KDS' });
    kdsToken = kdsRedeemRes.body.deviceToken;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  const orderEvent = (externalOrderId: string, status = 'PREPARING') => ({
    externalOrderId,
    orderType: 'DINE_IN',
    status,
    tableId: 'table-1',
    tableLabel: 'T1',
    items: [
      { externalItemId: 'item-1', name: 'Butter Naan', quantity: 2, unitPrice: 60, modifiers: [], kitchenStatus: 'PREPARING', lineTotal: 120 }
    ],
    subtotal: 120,
    taxAmount: 6,
    discountAmount: 0,
    totalAmount: 126,
    updatedAt: new Date().toISOString()
  });

  it('pushes an order from POS and a KDS device can pull it via catch-up', async () => {
    const pushRes = await authed('post', '/api/v1/orders/sync', posToken).send({ events: [orderEvent('local-ord-1')] });
    expect(pushRes.status).toBe(201);
    expect(pushRes.body.results).toEqual([{ externalOrderId: 'local-ord-1', status: 'ok', syncVersion: 1 }]);

    const pullRes = await authed('get', '/api/v1/orders/sync', kdsToken);
    expect(pullRes.status).toBe(200);
    expect(pullRes.body.orders).toHaveLength(1);
    expect(pullRes.body.orders[0]).toMatchObject({ externalOrderId: 'local-ord-1', status: 'PREPARING', totalAmount: 126 });
  });

  it('re-pushing the same externalOrderId updates in place and bumps syncVersion instead of duplicating', async () => {
    const res = await authed('post', '/api/v1/orders/sync', posToken).send({ events: [orderEvent('local-ord-1', 'READY')] });
    expect(res.body.results[0]).toEqual({ externalOrderId: 'local-ord-1', status: 'ok', syncVersion: 2 });

    const rows = await prisma.runAsTenant(restaurantId, (tx) => tx.syncedOrder.findMany({ where: { externalOrderId: 'local-ord-1' } }));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('READY');
  });

  it('a catch-up pull with a since cursor only returns orders updated after it', async () => {
    // Use the API's own serverTime as the cursor, exactly as a real client
    // does (see packages/sync/src/outbox.ts's catchUpFromCloud) — anchoring
    // to client-side Date.now() instead would race against the previous
    // test's write under load, since both run on the same clock but not
    // atomically relative to each other.
    const cursorRes = await authed('get', '/api/v1/orders/sync?since=2999-01-01T00:00:00.000Z', kdsToken);
    const cursor = cursorRes.body.serverTime;

    await authed('post', '/api/v1/orders/sync', posToken).send({ events: [orderEvent('local-ord-2')] });

    const pullRes = await authed('get', `/api/v1/orders/sync?since=${encodeURIComponent(cursor)}`, kdsToken);
    expect(pullRes.body.orders.map((o: any) => o.externalOrderId)).toEqual(['local-ord-2']);
  });

  /** security-audit HIGH-05: a branch-bound device must not receive another branch's orders (customer PII, totals). */
  it('a device bound to one branch does not see another branch\'s orders on catch-up', async () => {
    const branchARes = await authed('post', '/api/v1/branches', platformToken).send({ restaurantId, name: 'Branch A', code: 'BA' });
    const branchBRes = await authed('post', '/api/v1/branches', platformToken).send({ restaurantId, name: 'Branch B', code: 'BB' });
    const branchAId = branchARes.body.id;
    const branchBId = branchBRes.body.id;

    const keyA = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'POS', branchId: branchAId, expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const redeemA = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: keyA.body.code, deviceType: 'POS' });
    const posATokenBranch = redeemA.body.deviceToken;

    const keyB = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'KDS', branchId: branchBId, expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const redeemB = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: keyB.body.code, deviceType: 'KDS' });
    const kdsBTokenBranch = redeemB.body.deviceToken;

    const cursorRes = await authed('get', '/api/v1/orders/sync?since=2999-01-01T00:00:00.000Z', kdsToken);
    const cursor = cursorRes.body.serverTime;

    await authed('post', '/api/v1/orders/sync', posATokenBranch).send({ events: [orderEvent('branch-a-order')] });

    const branchBPull = await authed('get', `/api/v1/orders/sync?since=${encodeURIComponent(cursor)}`, kdsBTokenBranch);
    expect(branchBPull.body.orders.map((o: any) => o.externalOrderId)).not.toContain('branch-a-order');

    const branchAPull = await authed('get', `/api/v1/orders/sync?since=${encodeURIComponent(cursor)}`, posATokenBranch);
    expect(branchAPull.body.orders.map((o: any) => o.externalOrderId)).toContain('branch-a-order');

    // An unassigned device (branchId null) still sees everything. The restaurant now
    // has 3 branches (its auto-created default, plus A and B), so a freshly-redeemed
    // key with no explicit branchId gets no auto-assigned branch either (that only
    // happens when the restaurant has exactly one active branch) — a real "no branch"
    // device, unlike posToken/kdsToken from this file's beforeAll, which were redeemed
    // back when the restaurant's own auto-created default branch was its only one.
    const unassignedKey = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'KDS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const unassignedRedeem = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: unassignedKey.body.code, deviceType: 'KDS' });
    const unassignedToken = unassignedRedeem.body.deviceToken;
    const unassignedDeviceRow = await prisma.runAsPlatform((tx) => tx.device.findUniqueOrThrow({ where: { id: unassignedRedeem.body.device.id } }));
    expect(unassignedDeviceRow.branchId).toBeNull();

    const unassignedPull = await authed('get', `/api/v1/orders/sync?since=${encodeURIComponent(cursor)}`, unassignedToken);
    expect(unassignedPull.body.orders.map((o: any) => o.externalOrderId)).toContain('branch-a-order');
  });

  /** security-audit HIGH-05: once an order is settled/refunded, only the settling device or a POS/POS_ADMIN device may change its payment status. */
  it('a KDS device cannot revert a settled order\'s payment status; POS can', async () => {
    const settled = { ...orderEvent('settled-ord-1'), paymentStatus: 'SUCCESS' };
    const pushRes = await authed('post', '/api/v1/orders/sync', posToken).send({ events: [settled] });
    expect(pushRes.body.results[0].status).toBe('ok');

    const kdsAttempt = await authed('post', '/api/v1/orders/sync', kdsToken).send({
      events: [{ ...orderEvent('settled-ord-1'), paymentStatus: 'PENDING' }]
    });
    expect(kdsAttempt.body.results[0].status).toBe('error');

    const afterKds = await prisma.runAsTenant(restaurantId, (tx) => tx.syncedOrder.findFirst({ where: { externalOrderId: 'settled-ord-1' } }));
    expect(afterKds!.paymentStatus).toBe('SUCCESS');

    const conflict = await prisma.runAsTenant(restaurantId, (tx) => tx.syncConflict.findFirst({ where: { entityId: 'settled-ord-1' } }));
    expect(conflict).not.toBeNull();

    // POS (payment-authoritative) can still legitimately issue a refund transition.
    const posRefund = await authed('post', '/api/v1/orders/sync', posToken).send({
      events: [{ ...orderEvent('settled-ord-1'), paymentStatus: 'REFUNDED' }]
    });
    expect(posRefund.body.results[0].status).toBe('ok');
  });

  it('a device from another restaurant cannot see or push into this one (RLS)', async () => {
    const otherRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Other Order Sync Restaurant ${Date.now()}`,
      ownerName: 'Other Owner',
      ownerEmail: `order-sync-other-owner-${Date.now()}@test.example.com`
    });
    const otherRestaurantId = otherRes.body.restaurant.id;
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId: otherRestaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
    const otherKeyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId: otherRestaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const otherRedeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: otherKeyRes.body.code, deviceType: 'POS' });
    const otherToken = otherRedeemRes.body.deviceToken;

    const pullRes = await authed('get', '/api/v1/orders/sync?since=2000-01-01T00:00:00.000Z', otherToken);
    expect(pullRes.body.orders).toEqual([]);

    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: otherRestaurantId } }));
  });

  it('suspending the restaurant blocks every device-authenticated request from its terminals', async () => {
    const suspendRes = await authed('patch', `/api/v1/restaurants/${restaurantId}/suspend`, platformToken);
    expect(suspendRes.status).toBe(200);

    const pushRes = await authed('post', '/api/v1/orders/sync', posToken).send({ events: [orderEvent('local-ord-3')] });
    expect(pushRes.status).toBe(403);

    const pullRes = await authed('get', '/api/v1/orders/sync', kdsToken);
    expect(pullRes.status).toBe(403);
  });

  it('reactivating the restaurant restores access immediately', async () => {
    const reactivateRes = await authed('patch', `/api/v1/restaurants/${restaurantId}/reactivate`, platformToken);
    expect(reactivateRes.status).toBe(200);

    const pullRes = await authed('get', '/api/v1/orders/sync', kdsToken);
    expect(pullRes.status).toBe(200);
  });

  it('suspending only the SUBSCRIPTION (restaurant itself stays ACTIVE) blocks terminals too — the two suspend mechanisms are independent and both must gate', async () => {
    const restaurant = await prisma.runAsPlatform((tx) => tx.restaurant.findUniqueOrThrow({ where: { id: restaurantId } }));
    expect(restaurant.status).toBe('ACTIVE');

    const suspendSubRes = await authed('patch', `/api/v1/subscriptions/${subscriptionId}/suspend`, platformToken);
    expect(suspendSubRes.status).toBe(200);

    const pushRes = await authed('post', '/api/v1/orders/sync', posToken).send({ events: [orderEvent('local-ord-4')] });
    expect(pushRes.status).toBe(403);

    const pullRes = await authed('get', '/api/v1/orders/sync', kdsToken);
    expect(pullRes.status).toBe(403);
  });

  it('reactivating the subscription restores access', async () => {
    await authed('patch', `/api/v1/subscriptions/${subscriptionId}/reactivate`, platformToken);

    const pullRes = await authed('get', '/api/v1/orders/sync', kdsToken);
    expect(pullRes.status).toBe(200);
  });

  it('an EXPIRED subscription (status ACTIVE but expiresAt in the past) also blocks terminals', async () => {
    await prisma.runAsPlatform((tx) => tx.subscription.update({ where: { id: subscriptionId }, data: { expiresAt: new Date(Date.now() - 1000) } }));

    const pullRes = await authed('get', '/api/v1/orders/sync', kdsToken);
    expect(pullRes.status).toBe(403);

    await prisma.runAsPlatform((tx) => tx.subscription.update({ where: { id: subscriptionId }, data: { expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } }));
  });
});
