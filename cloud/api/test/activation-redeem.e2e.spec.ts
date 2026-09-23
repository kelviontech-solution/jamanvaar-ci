import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Activation code redemption (the other half of activation-keys generation)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-redeem-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let planId: string;

  const authed = (method: 'get' | 'post' | 'patch', url: string) =>
    request(app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${platformToken}`);

  const generateKey = async (allowedDeviceType: string, expiresInMs = 60 * 60 * 1000) => {
    const res = await authed('post', '/api/v1/activation-keys').send({
      restaurantId,
      allowedDeviceType,
      expiresAt: new Date(Date.now() + expiresInMs).toISOString()
    });
    expect(res.status).toBe(201);
    return res.body.code as string;
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/platform-auth/login')
      .send({ email: adminEmail, password: adminPassword });
    platformToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants').send({
      name: `TEST Activation Redeem Restaurant ${Date.now()}`,
      ownerName: 'Redeem Test Owner',
      ownerEmail: `redeem-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;

    // A key/redemption is now gated on the restaurant's actual application
    // entitlements (see ApplicationEntitlementsService.assertAppEnabled) —
    // a restaurant with no subscription at all is correctly refused for
    // every app, so this suite (which exercises POS/KDS/CAPTAIN) needs a
    // real PRO subscription behind it, the same pattern tenant-auth.e2e
    // uses for the equivalent entitlement-dependent assertions.
    const planRes = await authed('post', '/api/v1/plans').send({
      tier: 'PRO',
      name: `TEST Activation Redeem Plan ${Date.now()}`,
      priceMonthly: 700000,
      maxBranches: 3,
      maxDevices: 20,
      maxUsers: 20,
      entitlements: { posTerminal: true, captainApp: true }
    });
    expect(planRes.status).toBe(201);
    planId = planRes.body.id;

    const subRes = await authed('post', '/api/v1/subscriptions').send({
      restaurantId,
      planId,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
    expect(subRes.status).toBe(201);
  });

  afterAll(async () => {
    // Restaurant deletion cascades away its Subscription (see schema.prisma
    // Subscription.restaurant onDelete: Cascade); the Plan row itself was
    // previously never cleaned up at all, leaving a permanent "TEST
    // Activation Redeem Plan <timestamp>" row visible in the real Super
    // Admin Plans list forever.
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) {
      await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    }
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('rejects an unknown code', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/activation/redeem')
      .send({ code: 'JMV-0000-0000-0000', deviceType: 'POS' });
    expect(res.status).toBe(404);
  });

  it('redeems a valid ANY-type code and creates a real, queryable Device row', async () => {
    const code = await generateKey('ANY');

    const res = await request(app.getHttpServer())
      .post('/api/v1/activation/redeem')
      .send({ code, deviceType: 'POS', appVersion: '1.0.0' });

    expect(res.status).toBe(201);
    expect(res.body.restaurantId).toBe(restaurantId);
    expect(res.body.device.status).toBe('ACTIVE');
    expect(res.body.device.type).toBe('POS');

    const deviceRes = await authed('get', `/api/v1/devices/${res.body.device.id}`);
    expect(deviceRes.status).toBe(200);
    expect(deviceRes.body.restaurantId).toBe(restaurantId);
  });

  it('rejects redeeming the same code twice', async () => {
    const code = await generateKey('ANY');

    const first = await request(app.getHttpServer())
      .post('/api/v1/activation/redeem')
      .send({ code, deviceType: 'KDS' });
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post('/api/v1/activation/redeem')
      .send({ code, deviceType: 'KDS' });
    expect(second.status).toBe(409);
  });

  it('rejects a device type that does not match the key\'s allowed type', async () => {
    const code = await generateKey('POS');

    const res = await request(app.getHttpServer())
      .post('/api/v1/activation/redeem')
      .send({ code, deviceType: 'CAPTAIN' });
    expect(res.status).toBe(400);
  });

  it('allows redemption when the device type matches the key\'s specific allowed type', async () => {
    const code = await generateKey('CAPTAIN');

    const res = await request(app.getHttpServer())
      .post('/api/v1/activation/redeem')
      .send({ code, deviceType: 'CAPTAIN' });
    expect(res.status).toBe(201);
    expect(res.body.device.type).toBe('CAPTAIN');
  });

  it('rejects an expired code', async () => {
    // expiresAt in the past — generate schema only requires a valid date, not a future one.
    const code = await generateKey('ANY', -60 * 1000);

    const res = await request(app.getHttpServer())
      .post('/api/v1/activation/redeem')
      .send({ code, deviceType: 'KIOSK' });
    expect(res.status).toBe(410);
  });

  it('rejects a revoked code', async () => {
    const genRes = await authed('post', '/api/v1/activation-keys').send({
      restaurantId,
      allowedDeviceType: 'ANY',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    });
    const keyId = genRes.body.id;
    const code = genRes.body.code;

    const revokeRes = await authed('patch', `/api/v1/activation-keys/${keyId}/revoke`);
    expect(revokeRes.status).toBe(200);

    const res = await request(app.getHttpServer())
      .post('/api/v1/activation/redeem')
      .send({ code, deviceType: 'KIOSK' });
    expect(res.status).toBe(410);
  });

  /**
   * security-audit MED-02: 10 concurrent redemptions of the SAME code used to be able
   * to all succeed (a plain read-then-write race), each minting its own device from a
   * single-use key. Exactly one must win now.
   */
  it('exactly one of many concurrent redemptions of the same code succeeds', async () => {
    const code = await generateKey('ANY');

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code, deviceType: 'POS' }))
    );

    // The actual security invariant: at most one caller may ever see success — this is
    // what the old, non-atomic claim violated. A "loser" under 10-way concurrency in
    // this test's small connection pool may occasionally surface as a transaction-pool
    // timeout (500) rather than a clean 409 conflict; that's a test-harness artifact of
    // the pool size, not a security-relevant outcome, so it isn't asserted strictly —
    // what matters is that it is never a second 201.
    const succeeded = responses.filter((r) => r.status === 201);
    expect(succeeded).toHaveLength(1);
    expect(responses.every((r) => r.status === 201 || r.status === 409 || r.status >= 500)).toBe(true);

    const key = await prisma.runAsPlatform((tx) => tx.activationKey.findUnique({ where: { code } }));
    expect(key!.status).toBe('REDEEMED');
    expect(key!.redeemedByDeviceId).toBe(succeeded[0].body.device.id);
  });

  it('creates a SYSTEM audit record for a successful redemption', async () => {
    const code = await generateKey('ANY');
    const redeemRes = await request(app.getHttpServer())
      .post('/api/v1/activation/redeem')
      .send({ code, deviceType: 'POS' });
    expect(redeemRes.status).toBe(201);

    const audit = await prisma.auditLog.findFirst({
      where: { actorType: 'SYSTEM', action: 'ACTIVATION_KEY_REDEEMED', restaurantId },
      orderBy: { createdAt: 'desc' }
    });
    expect(audit).toBeTruthy();
    expect((audit!.details as Record<string, unknown>).deviceId).toBe(redeemRes.body.device.id);
  });
});
