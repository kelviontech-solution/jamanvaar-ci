import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Real-time delivery (realtime.controller.ts) holds one SSE connection per device, and each
 * connection independently re-runs a device.findUnique every REALTIME_RECHECK_MS (default 30s) to
 * detect a revoke. Normally those 30s timers land spread out across time, but after a backend
 * restart or network blip, every device's SSE client reconnects and starts its recheck timer at
 * roughly the same moment — a "reconnection storm." This measures that exact query, at a burst size
 * modelling a restaurant fleet, against the real database (unlike order-sync's pushEvents, this
 * query takes no lock and isn't behind any admission gate — it's exactly the pattern order-sync's
 * pool-exhaustion bug came from, so it's worth checking rather than assuming it's fine).
 */
describe('Realtime recheck reconnection storm: many devices\' revocation checks firing in the same instant', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-realtime-storm-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  const deviceIds: string[] = [];

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    const loginRes = await platformLogin(app, adminEmail, adminPassword);
    platformToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Realtime Storm Restaurant ${Date.now()}`, ownerName: 'Storm Owner', ownerEmail: `storm-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;
    const planRes = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO', name: `TEST Storm Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 200, maxUsers: 20, entitlements: { posTerminal: true, kotKdsRouting: true }
    });
    planId = planRes.body.id;
    await authed('post', '/api/v1/subscriptions', platformToken).send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });

    // 25 real registered devices — enough variety to be realistic, below the activation
    // endpoint's own rate limit for this test's setup. The storm itself (below) fires 150
    // concurrent recheck queries across them: what's being measured is concurrent query volume
    // against the database, not literally needing 150 distinct device rows.
    for (let i = 0; i < 25; i++) {
      const keyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
      const redeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: keyRes.body.code, deviceType: 'POS' });
      if (!redeemRes.body?.device?.id) throw new Error(`device #${i} setup failed: key=${keyRes.status} ${JSON.stringify(keyRes.body)} redeem=${redeemRes.status} ${JSON.stringify(redeemRes.body)}`);
      deviceIds.push(redeemRes.body.device.id);
    }
  }, 60_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('150 concurrent recheck queries firing in the same instant all complete without a connection error', async () => {
    // The exact query realtime.controller.ts's status$ observable runs, fired for every open SSE
    // connection's recheck timer at once — modelled here as 150 concurrent calls across 25 real devices.
    const recheck = (deviceId: string) => prisma.runAsPlatform((tx) =>
      tx.device.findUnique({ where: { id: deviceId }, select: { status: true, isLocked: true, branchId: true, restaurant: { select: { status: true, deletedAt: true } }, branch: { select: { status: true } } } })
    );

    const calls = Array.from({ length: 150 }, (_, i) => deviceIds[i % deviceIds.length]);
    const t0 = Date.now();
    const settled = await Promise.allSettled(calls.map(recheck));
    const ms = Date.now() - t0;

    const rejected = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected');
    if (rejected.length) console.log(`[load] realtime recheck storm failures: ${rejected.map((r) => String(r.reason?.message ?? r.reason)).join(' | ')}`);
    console.log(`[load] 150 concurrent realtime recheck queries: ${ms}ms total (${Math.round(ms / 150)}ms/query amortised), ${rejected.length} failed`);

    expect(rejected).toHaveLength(0);
    expect(settled.every((s) => s.status === 'fulfilled' && s.value !== null)).toBe(true);
  }, 60_000);
});
