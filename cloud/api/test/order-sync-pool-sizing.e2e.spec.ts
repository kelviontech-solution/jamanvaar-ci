// Must be set before createTestApp() constructs PrismaService/OrderSyncAdmission — both read
// DB_POOL_SIZE from the environment at construction time.
process.env.DB_POOL_SIZE = '20';

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Empirical answer to "what should DB_POOL_SIZE actually be set to in production?" — not a guess.
 * .env.example documents 5 as an example value, which order-sync-load.e2e.spec.ts shows is enough to
 * avoid the connection-exhaustion bug fixed there, but says nothing about how much real headroom a
 * larger, still-safe pool buys. This measures 150 concurrent order-sync pushes (3x the 50 that
 * exposed the original bug) against a real Postgres whose own max_connections (checked directly:
 * 100 on this machine) comfortably allows a pool of 20 per API instance with room for several more
 * instances or other processes before approaching that ceiling.
 */
describe('Order-sync throughput with a production-realistic DB_POOL_SIZE=20 (not the bug-triggering unset/5 default)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-pool-sizing-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  const deviceTokens: string[] = [];

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    const loginRes = await platformLogin(app, adminEmail, adminPassword);
    platformToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Pool Sizing Restaurant ${Date.now()}`, ownerName: 'Pool Sizing Owner', ownerEmail: `pool-sizing-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;
    const planRes = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO', name: `TEST Pool Sizing Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { posTerminal: true, kotKdsRouting: true }
    });
    planId = planRes.body.id;
    await authed('post', '/api/v1/subscriptions', platformToken).send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });

    for (let i = 0; i < 15; i++) {
      const keyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
      const redeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: keyRes.body.code, deviceType: 'POS' });
      deviceTokens.push(redeemRes.body.deviceToken);
    }
  }, 60_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  const orderEvent = (externalOrderId: string) => ({
    externalOrderId, orderType: 'DINE_IN', status: 'PREPARING', tableId: `table-${externalOrderId}`, tableLabel: externalOrderId,
    items: [{ externalItemId: 'item-1', name: 'Butter Naan', quantity: 2, unitPrice: 60, modifiers: [], kitchenStatus: 'PREPARING', lineTotal: 120 }],
    subtotal: 120, taxAmount: 6, discountAmount: 0, totalAmount: 126, updatedAt: new Date().toISOString()
  });

  it.each([150, 300, 500, 1000])('%d concurrent order-sync pushes from 15 POS terminals in one restaurant: counted precisely, never a raw connection error', async (n) => {
    const pushes = Array.from({ length: n }, (_, i) => authed('post', '/api/v1/orders/sync', deviceTokens[i % deviceTokens.length]).send({ events: [orderEvent(`pool-ord-${n}-${i}`)] }));
    const t0 = Date.now();
    const results = await Promise.all(pushes);
    const ms = Date.now() - t0;

    const okCount = results.filter((r) => r.status === 201).length;
    const busyCount = results.filter((r) => r.status === 503).length;
    const otherCount = results.length - okCount - busyCount;
    const otherStatuses = results.filter((r) => r.status !== 201 && r.status !== 503).map((r) => r.status);

    const runtimeRes = await authed('get', '/api/v1/orders/sync/runtime', platformToken);
    console.log(`[load] ${n} concurrent order-sync pushes at DB_POOL_SIZE=20: ${ms}ms total (${(ms / n).toFixed(1)}ms/push amortised, ${(n / (ms / 1000)).toFixed(1)}/sec), ${okCount} ok, ${busyCount} clean-503, ${otherCount} other${otherStatuses.length ? ' [' + otherStatuses.join(',') + ']' : ''}; admission runtime: ${JSON.stringify(runtimeRes.body.admission)}`);

    // The one correctness bar that must never break regardless of scale: no raw, ungraceful
    // failure. Every push either succeeds or is told to retry — nothing just breaks.
    expect(otherCount).toBe(0);
    expect(okCount + busyCount).toBe(n);
  }, 120_000);

  /**
   * Diagnostic, not a correctness assertion on the backend: firing hundreds of raw TCP connects
   * against one in-process test server in the exact same event-loop tick (what `Promise.all` over
   * `it.each`'s 300/500/1000 cases above does) can itself hit a local connection-accept limit before
   * either the admission gate or Postgres ever sees the request — exactly the "the load generator
   * becomes the bottleneck" risk. This sends the same 300 pushes in six batches of 50 instead of one
   * burst of 300, to tell apart "the backend can't take 300 concurrent" from "this test harness's
   * single Node process can't open 300 simultaneous raw sockets to itself at once."
   */
  it.each([300, 1000, 3000])('%d pushes sent as waves of 50 (not one simultaneous burst) — the backend/database ceiling, with the local test harness\'s own connection-accept limit isolated out', async (total) => {
    const batches = total / 50;
    let ok = 0, busy = 0, other = 0;
    const otherCodes: number[] = [];
    const t0 = Date.now();
    for (let batch = 0; batch < batches; batch++) {
      const pushes = Array.from({ length: 50 }, (_, i) =>
        authed('post', '/api/v1/orders/sync', deviceTokens[i % deviceTokens.length]).send({ events: [orderEvent(`batched-${total}-${batch}-${i}`)] })
      );
      const results = await Promise.all(pushes);
      for (const r of results) { if (r.status === 201) ok++; else if (r.status === 503) busy++; else { other++; otherCodes.push(r.status); } }
    }
    const ms = Date.now() - t0;
    console.log(`[diag] ${total} pushes, ${batches} waves of 50: ${ms}ms total (${(total / (ms / 1000)).toFixed(1)}/sec sustained), ${ok} ok, ${busy} busy, ${other} other${otherCodes.length ? ' [' + otherCodes.join(',') + ']' : ''}`);
    expect(other).toBe(0);
  }, 180_000);
});
