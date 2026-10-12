import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Real, measured evidence for the device order-sync path (POS/Kiosk/Captain/KDS/Admin) under
 * concurrent load, mirroring the existing QR-ordering load measurements in qr-scale.e2e.spec.ts.
 * This is the path OrderSyncAdmission now protects. The numbers here are from one local
 * dev-grade machine and database, not production-equivalent infrastructure — they show relative
 * behaviour (does it stay correct, does it degrade gracefully) rather than a production capacity
 * claim.
 */
describe('Order sync load: many devices pushing to one restaurant at once', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-order-sync-load-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  const deviceTokens: string[] = [];

  const authed = (method: 'get' | 'post' | 'patch', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await platformLogin(app, adminEmail, adminPassword);
    platformToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Order Sync Load Restaurant ${Date.now()}`,
      ownerName: 'Order Sync Load Owner',
      ownerEmail: `order-sync-load-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;

    const planRes = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO', name: `TEST Order Sync Load Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { posTerminal: true, kotKdsRouting: true }
    });
    planId = planRes.body.id;
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });

    // 10 distinct POS terminals, as if a busy multi-counter restaurant — this is what actually
    // exercises the per-restaurant advisory lock (order-sync.service.ts), not just one device.
    for (let i = 0; i < 10; i++) {
      const keyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
      const redeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: keyRes.body.code, deviceType: 'POS' });
      deviceTokens.push(redeemRes.body.deviceToken);
    }
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  const orderEvent = (externalOrderId: string) => ({
    externalOrderId,
    orderType: 'DINE_IN',
    status: 'PREPARING',
    tableId: `table-${externalOrderId}`,
    tableLabel: externalOrderId,
    items: [{ externalItemId: 'item-1', name: 'Butter Naan', quantity: 2, unitPrice: 60, modifiers: [], kitchenStatus: 'PREPARING', lineTotal: 120 }],
    subtotal: 120, taxAmount: 6, discountAmount: 0, totalAmount: 126, updatedAt: new Date().toISOString()
  });

  it('50 concurrent order pushes from 10 POS terminals in one restaurant: every order is stored exactly once, none lost or duplicated', async () => {
    const pushes = Array.from({ length: 50 }, (_, i) => {
      const token = deviceTokens[i % deviceTokens.length];
      return authed('post', '/api/v1/orders/sync', token).send({ events: [orderEvent(`load-ord-${i}`)] });
    });
    const t0 = Date.now();
    const results = await Promise.all(pushes);
    const ms = Date.now() - t0;

    const okCount = results.filter((r) => r.status === 201 && r.body.results?.[0]?.status === 'ok').length;
    const busyCount = results.filter((r) => r.status === 503).length;
    expect(okCount + busyCount).toBe(50);
    // Every push that wasn't rejected with a clean 503 must have actually succeeded — no silent failures.
    expect(results.every((r) => r.status === 201 || r.status === 503)).toBe(true);

    const pulled = await authed('get', '/api/v1/orders/sync?afterSeq=0', deviceTokens[0]);
    const loadOrders = pulled.body.orders.filter((o: any) => o.externalOrderId?.startsWith('load-ord-'));
    expect(loadOrders).toHaveLength(okCount); // exactly the accepted ones, no duplicates, none lost
    expect(new Set(loadOrders.map((o: any) => o.externalOrderId)).size).toBe(okCount);

    console.log(`[load] 50 concurrent order-sync pushes, 10 POS terminals, 1 restaurant: ${ms}ms total (${Math.round(ms / 50)}ms/push amortised), ${okCount} admitted, ${busyCount} returned a clean 503`);
  }, 60_000);

  it('platform staff can read order-sync admission runtime figures', async () => {
    const res = await authed('get', '/api/v1/orders/sync/runtime', platformToken);
    expect(res.status).toBe(200);
    expect(res.body.admission).toMatchObject({ admitted: expect.any(Number), rejected: expect.any(Number), peakActive: expect.any(Number) });
    console.log(`[load] order-sync admission runtime: ${JSON.stringify(res.body.admission)}`);
  });
});
