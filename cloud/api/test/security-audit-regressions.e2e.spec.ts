import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * security-audit remediation regressions that don't naturally belong to one existing
 * spec file — grouped here by finding ID so they're easy to find again. Each test names
 * the finding it proves is fixed; see security-audit/FINDINGS.md for full detail.
 */
describe('security-audit remediation regressions', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const ownerEmail = `test-secaudit-owner-${Date.now()}@example.com`;
  const ownerPassword = 'correct-horse-battery-staple';
  let ownerToken: string;
  let readOnlyToken: string;
  let restaurantId: string;
  let planId: string;

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    await createTestPlatformUser(prisma, { email: ownerEmail, password: ownerPassword, role: 'PLATFORM_OWNER' });
    const ownerLogin = await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email: ownerEmail, password: ownerPassword });
    ownerToken = ownerLogin.body.accessToken;

    const readOnlyEmail = `test-secaudit-readonly-${Date.now()}@example.com`;
    await createTestPlatformUser(prisma, { email: readOnlyEmail, password: ownerPassword, role: 'READ_ONLY' });
    const roLogin = await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email: readOnlyEmail, password: ownerPassword });
    readOnlyToken = roLogin.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', ownerToken).send({
      name: `TEST SecAudit Restaurant ${Date.now()}`,
      ownerName: 'SecAudit Owner',
      ownerEmail: `secaudit-tenant-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;

    const planRes = await authed('post', '/api/v1/plans', ownerToken).send({
      tier: 'PRO', name: `TEST SecAudit Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { pos: true }
    });
    planId = planRes.body.id;
    await authed('post', '/api/v1/subscriptions', ownerToken).send({
      restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString()
    });
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: { in: [ownerEmail] } } });
    await app.close();
  });

  /** No credential-shaped field should EVER appear in a JSON response body, regardless of role. */
  function assertNoCredentialFields(body: unknown) {
    const json = JSON.stringify(body);
    for (const field of ['passwordHash', 'activationTokenHash', 'passwordResetHash', 'deviceTokenHash']) {
      expect(json, `response must not contain "${field}"`).not.toContain(`"${field}"`);
    }
  }

  describe('HIGH-01: support search/diagnostics no longer leak credential hashes', () => {
    it('GET /support/search never returns passwordHash/activationTokenHash/passwordResetHash/deviceTokenHash, for any role', async () => {
      const ownerRes = await authed('get', `/api/v1/support/search?q=SecAudit`, ownerToken);
      expect(ownerRes.status).toBe(200);
      assertNoCredentialFields(ownerRes.body);

      const roRes = await authed('get', `/api/v1/support/search?q=SecAudit`, readOnlyToken);
      expect(roRes.status).toBe(200);
      assertNoCredentialFields(roRes.body);
    });

    it('GET /support/diagnostics/:id never returns credential hashes, for any role', async () => {
      const ownerRes = await authed('get', `/api/v1/support/diagnostics/${restaurantId}`, ownerToken);
      expect(ownerRes.status).toBe(200);
      assertNoCredentialFields(ownerRes.body);

      const roRes = await authed('get', `/api/v1/support/diagnostics/${restaurantId}`, readOnlyToken);
      expect(roRes.status).toBe(200);
      assertNoCredentialFields(roRes.body);
    });
  });

  describe('HIGH-02: a live redeemable activation code is hidden from read-only platform roles', () => {
    it('READ_ONLY sees only codeLast4 for an AVAILABLE key, everywhere it can read one', async () => {
      const key = await authed('post', '/api/v1/activation-keys', ownerToken).send({
        restaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString()
      });
      expect(key.status, JSON.stringify(key.body)).toBe(201);

      const list = await authed('get', `/api/v1/activation-keys?restaurantId=${restaurantId}`, readOnlyToken);
      const row = list.body.find((k: { id: string }) => k.id === key.body.id);
      expect(row.code).toBeNull();
      expect(row.codeLast4).toBe(key.body.code.slice(-4));

      const detail = await authed('get', `/api/v1/activation-keys/${key.body.id}`, readOnlyToken);
      expect(detail.body.code).toBeNull();
      expect(detail.body.codeLast4).toBe(key.body.code.slice(-4));

      const restaurantDetail = await authed('get', `/api/v1/restaurants/${restaurantId}`, readOnlyToken);
      const embeddedKey = restaurantDetail.body.activationKeys.find((k: { id: string }) => k.id === key.body.id);
      expect(embeddedKey.code).toBeNull();

      const search = await authed('get', `/api/v1/support/search?q=${key.body.code}`, readOnlyToken);
      const foundKey = search.body.activationKeys.find((k: { id: string }) => k.id === key.body.id);
      expect(foundKey.code).toBeNull();

      // A caller with devices:write (the owner) still sees the real code — this is a
      // visibility restriction, not a functional regression for the roles that need it.
      const ownerList = await authed('get', `/api/v1/activation-keys?restaurantId=${restaurantId}`, ownerToken);
      const ownerRow = ownerList.body.find((k: { id: string }) => k.id === key.body.id);
      expect(ownerRow.code).toBe(key.body.code);
    });
  });

  describe('MED-14: telemetry event ingestion now requires a real device credential', () => {
    it('POST /platform/telemetry/events rejects an anonymous request, and a real device credential can write an event tagged with its OWN restaurant', async () => {
      const anon = await request(app.getHttpServer()).post('/api/v1/platform/telemetry/events').send({
        restaurantId: 'not-a-real-restaurant-id', entityType: 'ORDER', action: 'CREATE', status: 'SUCCESS'
      });
      expect(anon.status).toBe(401);

      const key = await authed('post', '/api/v1/activation-keys', ownerToken).send({ restaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
      const redeem = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: 'POS' });
      expect(redeem.status, JSON.stringify(redeem.body)).toBe(201);
      const deviceToken = redeem.body.deviceToken;

      const res = await authed('post', '/api/v1/platform/telemetry/events', deviceToken).send({
        // A malicious/forged restaurantId in the body is ignored — the server uses the device's own.
        restaurantId: 'some-other-restaurant-id',
        entityType: 'ORDER', action: 'CREATE', status: 'SUCCESS'
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.restaurantId).toBe(restaurantId);
      expect(res.body.deviceId).toBe(redeem.body.device.id);
    });
  });
});
