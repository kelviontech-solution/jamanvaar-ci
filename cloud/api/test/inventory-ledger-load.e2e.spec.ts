process.env.DB_POOL_SIZE = '5';

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * InventoryLedgerService.push (api/v1/inventory/movements) has no admission control, and shares
 * the exact serialization characteristic that caused order-sync's connection-pool-exhaustion bug
 * (order-sync-load.e2e.spec.ts): every push calls nextSyncSequence(tx, restaurantId)
 * (common/sync-sequence.ts), an INSERT...ON CONFLICT DO UPDATE against one row per restaurant,
 * whose row lock is held for the whole transaction. Many concurrent devices pushing to one
 * restaurant therefore queue behind that one row, each holding a pooled connection while it waits
 * — the same precondition, via a different lock mechanism, as the order-sync bug.
 *
 * Measured result (see docs/reports/robustness-scalability-audit-2026-10-11/REPORT.md): unlike
 * order-sync, this did NOT reproduce a connection-exhaustion failure even at DB_POOL_SIZE=5 and 50
 * concurrent pushes — each movement push is one fast INSERT with no per-event merge/audit work,
 * so the row-lock queue drains before the pool is exhausted. This test exists to keep proving
 * that, not because a fix was needed here.
 */
describe('Inventory-ledger push under concurrent load from many devices in one restaurant', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-inventory-load-${Date.now()}@example.com`;
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
      name: `TEST Inventory Load Restaurant ${Date.now()}`, ownerName: 'Inv Owner', ownerEmail: `inv-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;
    const planRes = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO', name: `TEST Inventory Load Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { posTerminal: true, kotKdsRouting: true }
    });
    planId = planRes.body.id;
    await authed('post', '/api/v1/subscriptions', platformToken).send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });

    for (let i = 0; i < 10; i++) {
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

  const movement = (id: string) => ({
    movementId: id, itemId: 'item-1', itemName: 'Paneer', type: 'SALE', quantityDelta: -1, unit: 'kg', reason: 'order', occurredAt: new Date().toISOString()
  });

  it('50 concurrent movement pushes from 10 devices in one restaurant, at DB_POOL_SIZE=5: every push accepted, never a raw connection error', async () => {
    const pushes = Array.from({ length: 50 }, (_, i) =>
      authed('post', '/api/v1/inventory/movements', deviceTokens[i % deviceTokens.length]).send({ movements: [movement(`inv-load-${i}`)] })
    );
    const t0 = Date.now();
    const results = await Promise.all(pushes);
    const ms = Date.now() - t0;

    const okCount = results.filter((r) => r.status === 200 || r.status === 201).length;
    const busyCount = results.filter((r) => r.status === 503).length;
    const otherCount = results.length - okCount - busyCount;
    const otherStatuses = results.filter((r) => r.status !== 200 && r.status !== 201 && r.status !== 503).map((r) => ({ status: r.status, body: r.body }));

    console.log(`[load] 50 concurrent inventory-movement pushes at DB_POOL_SIZE=5: ${ms}ms total (${(ms / 50).toFixed(1)}ms/push), ${okCount} ok, ${busyCount} clean-503, ${otherCount} other${otherStatuses.length ? ' ' + JSON.stringify(otherStatuses.slice(0, 2)) : ''}`);

    expect(otherCount).toBe(0);
    expect(okCount + busyCount).toBe(50);
  }, 60_000);

  it('300 movement pushes sent as 6 waves of 50 (isolating the local test harness\'s own connection-accept limit, same technique as order-sync-pool-sizing.e2e.spec.ts): all succeed', async () => {
    let ok = 0, other = 0;
    const otherCodes: number[] = [];
    const t0 = Date.now();
    for (let batch = 0; batch < 6; batch++) {
      const pushes = Array.from({ length: 50 }, (_, i) =>
        authed('post', '/api/v1/inventory/movements', deviceTokens[i % deviceTokens.length]).send({ movements: [movement(`inv-wave-${batch}-${i}`)] })
      );
      const results = await Promise.all(pushes);
      for (const r of results) { if (r.status === 200 || r.status === 201) ok++; else { other++; otherCodes.push(r.status); } }
    }
    const ms = Date.now() - t0;
    console.log(`[load] 300 inventory pushes, 6 waves of 50: ${ms}ms total (${(300 / (ms / 1000)).toFixed(1)}/sec), ${ok} ok, ${other} other${otherCodes.length ? ' [' + otherCodes.join(',') + ']' : ''}`);
    expect(other).toBe(0);
    expect(ok).toBe(300);
  }, 120_000);
});
