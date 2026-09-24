import { createPublicKey, verify } from 'crypto';
import { vi } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

// Mirrors the public half of packages/business/src/license_certificate.ts's
// LICENSE_PUBLIC_KEY_JWK — kept as a plain literal here (not imported) since
// cloud/api is a separate CommonJS package with no dependency on the frontend
// workspace packages. This is the PUBLIC key only; it proves nothing on its
// own without a matching private-key signature to check against it.
// The production private key is not available to tests, so the suite signs with a throwaway pair and
// verifies against ITS public half: this proves the sign/verify contract (IEEE-P1363, key id) that the
// apps' verifier (packages/business, packages/sync) relies on, without needing the real key.
// ConfigModule validates the environment at import time, so this must be hoisted.
const { LICENSE_PUBLIC_KEY_JWK } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { generateKeyPairSync } = require('crypto');
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  process.env.LICENSE_SIGNING_PRIVATE_KEY_B64 = Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()).toString('base64');
  process.env.LICENSE_SIGNING_KEY_ID = 'test-k2';
  return { LICENSE_PUBLIC_KEY_JWK: publicKey.export({ format: 'jwk' }) as JsonWebKey };
});

function b64urlToBuffer(b64url: string): Buffer {
  return Buffer.from(b64url, 'base64url');
}

describe('Offline license certificate issuance (ENT-001 fix)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-licensing-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let planId: string;

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const platformLoginRes = await platformLogin(app, adminEmail, adminPassword);
    platformToken = platformLoginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Licensing Restaurant ${Date.now()}`,
      ownerName: 'Licensing Test Owner',
      ownerEmail: `licensing-owner-${Date.now()}@example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;
  });

  afterAll(async () => {
    if (planId) {
      await prisma.runAsPlatform((tx) => tx.subscription.deleteMany({ where: { planId } }));
      await prisma.plan.deleteMany({ where: { id: planId } });
    }
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/restaurants/${restaurantId}/license-certificate`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the restaurant has no active/trial subscription yet', async () => {
    const res = await authed('get', `/api/v1/restaurants/${restaurantId}/license-certificate`, platformToken);
    expect(res.status).toBe(404);
  });

  it('issues a certificate whose signature is genuinely verifiable against the real embedded public key, and whose payload matches the actual subscription', async () => {
    const planRes = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO',
      name: `TEST Licensing Plan ${Date.now()}`,
      priceMonthly: 700000,
      maxBranches: 3,
      maxDevices: 10,
      maxUsers: 20,
      entitlements: { posTerminal: true, captainApp: true, qrTableOrdering: true }
    });
    planId = planRes.body.id;

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId,
      planId,
      status: 'ACTIVE',
      expiresAt
    });

    const res = await authed('get', `/api/v1/restaurants/${restaurantId}/license-certificate`, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.payload).toBeTypeOf('string');
    expect(res.body.signature).toBeTypeOf('string');

    const payloadBytes = b64urlToBuffer(res.body.payload);
    const signatureBytes = b64urlToBuffer(res.body.signature);

    const publicKey = createPublicKey({ key: LICENSE_PUBLIC_KEY_JWK as never, format: 'jwk' });
    const valid = verify('SHA256', payloadBytes, { key: publicKey, dsaEncoding: 'ieee-p1363' }, signatureBytes);
    expect(valid).toBe(true);

    const payload = JSON.parse(payloadBytes.toString('utf8'));
    expect(payload.restaurantId).toBe(restaurantId);
    // Names the key that signed it, so the key can be rotated without breaking old certificates (BUG-076).
    expect(payload.kid).toBe('test-k2');
    expect(payload.tier).toBe('PRO');
    expect(payload.entitlements.captainApp).toBe(true);
    expect(payload.entitlements.qrTableOrdering).toBe(true);
    expect(new Date(payload.expiresAt).toISOString()).toBe(expiresAt);
  });

  it('rejects a payload tampered after issuance, proving the signature actually constrains the content', async () => {
    const res = await authed('get', `/api/v1/restaurants/${restaurantId}/license-certificate`, platformToken);
    expect(res.status).toBe(200);

    const payload = JSON.parse(b64urlToBuffer(res.body.payload).toString('utf8'));
    payload.tier = 'ENTERPRISE'; // attacker tries to upgrade the tier post-issuance
    const tamperedPayloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');
    const signatureBytes = b64urlToBuffer(res.body.signature);

    const publicKey = createPublicKey({ key: LICENSE_PUBLIC_KEY_JWK as never, format: 'jwk' });
    const valid = verify('SHA256', tamperedPayloadBytes, { key: publicKey, dsaEncoding: 'ieee-p1363' }, signatureBytes);
    expect(valid).toBe(false);
  });
});
