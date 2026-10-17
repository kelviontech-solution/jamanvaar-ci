import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin, ownerDeviceSession } from './helpers';
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

    const loginRes = await platformLogin(app, adminEmail, adminPassword);
    platformToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants').send({
      name: `TEST Activation Redeem Restaurant ${Date.now()}`,
      ownerName: 'Redeem Test Owner',
      ownerEmail: `redeem-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;
    expect(restaurantRes.body.restaurant.restaurantCode).toMatch(/^JM[6-9][0-9]{9}$/);

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
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      // Phase 5 split Kiosk into its own commercial family — a RESTAURANT-family PRO plan no
      // longer defaults to including it, and this suite redeems KIOSK keys below.
      applications: ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN']
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

  it('rejects a mismatched restaurant or branch without consuming the kiosk key', async () => {
    const code=await generateKey('KIOSK');
    const branch=await prisma.runAsPlatform(tx=>tx.branch.findFirstOrThrow({where:{restaurantId}}));
    const wrong='00000000-0000-4000-8000-000000000001';
    const redeem=(expectedRestaurantId:string,expectedBranchId:string)=>request(app.getHttpServer()).post('/api/v1/activation/redeem').send({code,deviceType:'KIOSK',expectedRestaurantId,expectedBranchId});
    expect((await redeem(wrong,branch.id)).status).toBe(400);
    expect((await redeem(restaurantId,wrong)).status).toBe(400);
    const key=await prisma.runAsPlatform(tx=>tx.activationKey.findUniqueOrThrow({where:{code}}));
    expect(key.status).toBe('ACTIVE');expect(key.redeemedByDeviceId).toBeNull();
    expect((await redeem(restaurantId,branch.id)).status).toBe(201);
  });

  it('returns only the authenticated restaurant setup identity and persists a branch-scoped request', async () => {
    const code=await generateKey('POS_ADMIN');
    const a=await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({code,deviceType:'POS_ADMIN'});
    expect(a.status).toBe(201);
    const token=await ownerDeviceSession(prisma,a.body.deviceToken);
    const route='/api/v1/tenant/me/kiosk-setup';
    expect((await request(app.getHttpServer()).get(route)).status).toBe(401);
    expect((await request(app.getHttpServer()).get(route).set('Authorization','Bearer '+a.body.deviceToken)).status).toBe(401);
    const setup=await request(app.getHttpServer()).get(route).set('Authorization','Bearer '+token);
    const restaurant=await prisma.runAsPlatform(tx=>tx.restaurant.findUniqueOrThrow({where:{id:restaurantId}}));
    expect(setup.status).toBe(200);expect(setup.body.restaurantCode).toBe(restaurant.restaurantCode);
    expect(Object.keys(setup.body).sort()).toEqual(['kioskWebUrl','name','restaurantCode']);
    const branch=await prisma.runAsPlatform(tx=>tx.branch.findFirstOrThrow({where:{restaurantId}}));
    const tickets='/api/v1/tenant/support-tickets';
    const sent=await request(app.getHttpServer()).post(tickets).set('Authorization','Bearer '+token).send({subject:'Kiosk activation key',description:'Please issue one KIOSK terminal activation key.',category:'ONBOARDING',branchId:branch.id});
    expect(sent.status).toBe(201);
    const list=await request(app.getHttpServer()).get(tickets).set('Authorization','Bearer '+token);
    expect(list.body.find((t:any)=>t.id===sent.body.id).branchId).toBe(branch.id);
    const keyCount=await prisma.runAsPlatform(tx=>tx.activationKey.count({where:{restaurantId,status:'ACTIVE'}}));
    expect(sent.body).not.toHaveProperty('activationKey');
    expect((await request(app.getHttpServer()).post(tickets).set('Authorization','Bearer '+token).send({subject:'Kiosk activation key',description:'Wrong branch',category:'ONBOARDING',branchId:'00000000-0000-4000-8000-000000000001'})).status).toBe(400);
    expect(await prisma.runAsPlatform(tx=>tx.activationKey.count({where:{restaurantId,status:'ACTIVE'}}))).toBe(keyCount);
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
    // B2-050: generation itself now refuses a past expiresAt (a key dead on arrival used to be
    // accepted and listed as Active/Available until someone tried to redeem it) — so to reach this
    // endpoint's own expiry check, the key has to be created valid and genuinely age past its
    // (short) expiry before redemption is attempted, not created already-expired.
    const code = await generateKey('ANY', 300);
    await new Promise((resolve) => setTimeout(resolve, 700));

    const res = await request(app.getHttpServer())
      .post('/api/v1/activation/redeem')
      .send({ code, deviceType: 'KIOSK' });
    expect(res.status).toBe(410);
  });

  it('refuses to generate a key that is already expired (B2-050)', async () => {
    const res = await authed('post', '/api/v1/activation-keys').send({
      restaurantId,
      allowedDeviceType: 'ANY',
      expiresAt: new Date(Date.now() - 60 * 1000).toISOString()
    });
    expect(res.status).toBe(400);
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
