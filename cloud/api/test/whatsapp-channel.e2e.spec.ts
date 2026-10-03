import { createHash, createHmac } from 'crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Jamanvaar ↔ WhatsApp connector, Phase 0/1/2 scope (see
 * docs/integrations/JAMANVAAR_WHATSAPP_CONNECTOR_IMPLEMENTATION_PLAN.md): key issuance,
 * status, settings and revoke (tenant-facing), and validate-key (service-to-service,
 * HMAC-signed). channels/menu, channels/quote, channels/checkout and the payment→KDS webhook
 * ingestion are real as of Phase 3/4 — see whatsapp-channel-menu.e2e.spec.ts and
 * whatsapp-channel-payments.e2e.spec.ts for those. This file only checks that
 * channels/orders/:id fails closed (404, not a 500) for a restaurant/order it can't find.
 */
describe('Jamanvaar WhatsApp connector', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-wa-channel-admin-${stamp}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  const ownerEmail = `test-wa-channel-owner-${stamp}@example.com`;
  const ownerPassword = 'owner-correct-horse-battery';
  let platformToken: string;
  let restaurantId: string;
  let ownerToken: string;
  let planId: string;

  const http = () => request(app.getHttpServer());
  const asOwner = (method: 'get' | 'post' | 'patch', url: string) => http()[method](url).set('Authorization', `Bearer ${ownerToken}`);

  const SERVICE_SECRET = 'test-jamanvaar-service-secret-for-e2e-only-not-used-anywhere-real';
  function signed(method: string, path: string, body: unknown = {}) {
    const timestamp = String(Date.now());
    const raw = JSON.stringify(body ?? {});
    const bodyHash = createHash('sha256').update(raw).digest('hex');
    const signature = createHmac('sha256', SERVICE_SECRET).update(`${method.toUpperCase()}\n${path}\n${timestamp}\n${bodyHash}`).digest('hex');
    return { headers: { 'x-signature': signature, 'x-timestamp': timestamp }, raw };
  }
  const asService = (method: 'get' | 'post', path: string, body: unknown = {}) => {
    const { headers, raw } = signed(method, path, body);
    const req = http()
      [method](path)
      .set('x-signature', headers['x-signature'])
      .set('x-timestamp', headers['x-timestamp'])
      .set('content-type', 'application/json');
    return method === 'post' ? req.send(raw) : req;
  };

  beforeAll(async () => {
    process.env.JAMANVAAR_SERVICE_SECRET = SERVICE_SECRET;
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    platformToken = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;

    const restRes = await http()
      .post('/api/v1/restaurants')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: `TEST WA Channel ${stamp}`, ownerName: 'Owner', ownerEmail });
    restaurantId = restRes.body.restaurant.id;
    const activationToken = restRes.body.activationToken;

    await http().post('/api/v1/tenant-auth/set-initial-password').send({ restaurantId, email: ownerEmail, activationToken, newPassword: ownerPassword });
    const loginRes = await http().post('/api/v1/tenant-auth/login').send({ restaurantId, email: ownerEmail, password: ownerPassword });
    ownerToken = loginRes.body.accessToken;

    // Phase 6: every whatsapp-channel call now gates on the real WHATSAPP_ORDERING
    // entitlement (see WhatsAppChannelService.requireEntitled) -- explicit `applications`
    // grants it directly, same as every other test file in this suite that needs a
    // specific app enabled regardless of the plan's own tier defaults.
    const planRes = await http()
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ tier: 'PRO', name: `TEST WA Channel Plan ${stamp}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: {} });
    planId = planRes.body.id;
    await http()
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), applications: ['WHATSAPP_ORDERING'] });
  }, 60_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.whatsAppChannelConnection.deleteMany({ where: { restaurantId } }));
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('starts NOT_CONNECTED', async () => {
    const res = await asOwner('get', '/api/v1/tenant/whatsapp-channel/status');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('NOT_CONNECTED');
  });

  it('generates a key exactly once, shown only in the generate response', async () => {
    const res = await asOwner('post', '/api/v1/tenant/whatsapp-channel/generate-key');
    expect(res.status).toBe(201);
    expect(res.body.key).toMatch(/^jmn_live_/);
    expect(res.body.keyPrefix).toBe(res.body.key.slice(0, res.body.keyPrefix.length));

    const status = await asOwner('get', '/api/v1/tenant/whatsapp-channel/status');
    expect(status.body.status).toBe('PENDING');
    expect(JSON.stringify(status.body)).not.toContain(res.body.key);
    expect(status.body).not.toHaveProperty('keyHash');
  });

  it('rejects an unauthenticated call to the tenant endpoints', async () => {
    const res = await http().get('/api/v1/tenant/whatsapp-channel/status');
    expect(res.status).toBe(401);
  });

  describe('service-to-service (validate-key)', () => {
    let rawKey: string;

    beforeAll(async () => {
      const gen = await asOwner('post', '/api/v1/tenant/whatsapp-channel/generate-key');
      rawKey = gen.body.key;
    });

    it('rejects a call with no signature', async () => {
      const res = await http().post('/api/v1/service/whatsapp-channel/validate-key').send({ key: rawKey });
      expect(res.status).toBe(401);
    });

    it('rejects a call with a wrong signature', async () => {
      const res = await http()
        .post('/api/v1/service/whatsapp-channel/validate-key')
        .set('x-signature', 'a'.repeat(64))
        .set('x-timestamp', String(Date.now()))
        .send({ key: rawKey });
      expect(res.status).toBe(401);
    });

    it('rejects a stale timestamp even with an otherwise-correct signature', async () => {
      const staleTimestamp = String(Date.now() - 10 * 60_000);
      const raw = JSON.stringify({ key: rawKey });
      const bodyHash = createHash('sha256').update(raw).digest('hex');
      const signature = createHmac('sha256', SERVICE_SECRET).update(`POST\n/api/v1/service/whatsapp-channel/validate-key\n${staleTimestamp}\n${bodyHash}`).digest('hex');
      const res = await http()
        .post('/api/v1/service/whatsapp-channel/validate-key')
        .set('x-signature', signature)
        .set('x-timestamp', staleTimestamp)
        .set('content-type', 'application/json')
        .send(raw);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('STALE_TIMESTAMP');
    });

    it('validates a real key with a correct signature, connects it, and rejects replaying the exact same request', async () => {
      const first = await asService('post', '/api/v1/service/whatsapp-channel/validate-key', { key: rawKey });
      expect(first.status, JSON.stringify(first.body)).toBe(201);
      expect(first.body.restaurantId).toBe(restaurantId);
      expect(first.body.permissions).toContain('ORDER_CREATE');

      const status = await asOwner('get', '/api/v1/tenant/whatsapp-channel/status');
      expect(status.body.status).toBe('CONNECTED');

      // Replay: same signature+timestamp+body as `first` -- must be refused, not processed twice.
      const { headers, raw } = signed('POST', '/api/v1/service/whatsapp-channel/validate-key', { key: rawKey });
      const replayReq = http().post('/api/v1/service/whatsapp-channel/validate-key').set('x-signature', headers['x-signature']).set('x-timestamp', headers['x-timestamp']).set('content-type', 'application/json');
      const replayFirst = await replayReq.send(raw);
      expect(replayFirst.status).toBe(201); // first use of this exact signature succeeds
      const replaySecond = await http()
        .post('/api/v1/service/whatsapp-channel/validate-key')
        .set('x-signature', headers['x-signature'])
        .set('x-timestamp', headers['x-timestamp'])
        .set('content-type', 'application/json')
        .send(raw);
      expect(replaySecond.status).toBe(401);
      expect(replaySecond.body.code).toBe('REPLAYED_REQUEST');
    });

    it('rejects a revoked key', async () => {
      await asOwner('post', '/api/v1/tenant/whatsapp-channel/revoke');
      const res = await asService('post', '/api/v1/service/whatsapp-channel/validate-key', { key: rawKey });
      expect(res.status).toBe(404);
    });
  });

  it('settings updates auto-accept/prep-time/pause and is reflected in status', async () => {
    await asOwner('post', '/api/v1/tenant/whatsapp-channel/generate-key');
    const res = await asOwner('patch', '/api/v1/tenant/whatsapp-channel/settings').send({ autoAccept: true, prepTimeMinutes: 20, paused: true });
    expect(res.status).toBe(200);
    expect(res.body.autoAccept).toBe(true);
    expect(res.body.prepTimeMinutes).toBe(20);
    expect(res.body.pausedAt).not.toBeNull();
  });

  it('the order-status channel endpoint fails closed (404) for an unknown order, not a 500', async () => {
    const res = await asService('get', `/api/v1/service/whatsapp-channel/channels/orders/some-order-id?restaurantId=${restaurantId}`);
    expect(res.status).toBe(404);
  });

  it('the order-status channel endpoint requires a restaurantId, refuses cleanly rather than crashing without one', async () => {
    const res = await asService('get', '/api/v1/service/whatsapp-channel/channels/orders/some-order-id');
    expect(res.status).toBeLessThan(500);
  });
});
