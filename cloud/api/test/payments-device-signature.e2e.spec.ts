import { generateKeyPairSync, sign as cryptoSign } from 'crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { RazorpayGatewayService } from '../src/modules/payments/razorpay-gateway.service';

const APPS = ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN'];

/**
 * Device-bound keys: a key-registered Kiosk's payment requests must carry a signature only its own, never-exported
 * private key could produce. Mirrors what kiosk-user's deviceKeys.ts actually does — ECDSA P-256, raw IEEE P1363
 * signature bytes, SHA-256 of the exact body over `${method}\n${path}\n${timestamp}\n${bodyHashHex}`.
 */
describe('Device-bound kiosk signatures on payment routes', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-devicesig-admin-${stamp}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  const ids: string[] = [];

  const authed = (method: 'get' | 'post' | 'patch', url: string, token?: string) => {
    const req = request(app.getHttpServer())[method](url);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  const keyPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const publicKeyJwk = keyPair.publicKey.export({ format: 'jwk' }) as { kty: string; crv: string; x: string; y: string };

  const issueKioskToken = async (withKey: boolean) => {
    const keyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({
      restaurantId,
      allowedDeviceType: 'KIOSK',
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    const redeem = await request(app.getHttpServer())
      .post('/api/v1/activation/redeem')
      .send({ code: keyRes.body.code, deviceType: 'KIOSK', ...(withKey ? { publicKeyJwk } : {}) });
    return redeem.body.deviceToken as string;
  };

  const sign = (method: string, path: string, body: string, timestamp = String(Date.now())) => {
    const bodyHash = require('crypto').createHash('sha256').update(body).digest('hex');
    const payload = `${method}\n${path}\n${timestamp}\n${bodyHash}`;
    const signature = cryptoSign('sha256', Buffer.from(payload, 'utf8'), { key: keyPair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64');
    return { signature, timestamp };
  };

  // A second key pair, for a POS device — proves the guard applies to any device type with a registered key, not
  // a Kiosk-only special case.
  const posKeyPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const posPublicKeyJwk = posKeyPair.publicKey.export({ format: 'jwk' }) as { kty: string; crv: string; x: string; y: string };

  const issuePosToken = async (withKey: boolean) => {
    const keyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({
      restaurantId,
      allowedDeviceType: 'POS',
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    const redeem = await request(app.getHttpServer())
      .post('/api/v1/activation/redeem')
      .send({ code: keyRes.body.code, deviceType: 'POS', ...(withKey ? { publicKeyJwk: posPublicKeyJwk } : {}) });
    return redeem.body.deviceToken as string;
  };

  const signPos = (method: string, path: string, body: string, timestamp = String(Date.now())) => {
    const bodyHash = require('crypto').createHash('sha256').update(body).digest('hex');
    const payload = `${method}\n${path}\n${timestamp}\n${bodyHash}`;
    const signature = cryptoSign('sha256', Buffer.from(payload, 'utf8'), { key: posKeyPair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64');
    return { signature, timestamp };
  };

  // A third key pair, for a POS_ADMIN device registered through the OTHER activation path — owner-login then
  // activate-device, the one the admin consoles use instead of /api/v1/activation/redeem.
  const posAdminKeyPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const posAdminPublicKeyJwk = posAdminKeyPair.publicKey.export({ format: 'jwk' }) as { kty: string; crv: string; x: string; y: string };

  const issuePosAdminTokenViaActivateDevice = async (withKey: boolean) => {
    const ownerEmail = `devicesig-owner-${stamp}-${Math.random().toString(36).slice(2)}@test.example.com`;
    const ownerPassword = 'Correct-Horse-9-Battery';
    const createRes = await authed('post', '/api/v1/restaurants', platformToken).send({ name: `TEST Device Sig Owner ${stamp}`, ownerName: 'Owner', ownerEmail });
    const ownerRestaurantId = createRes.body.restaurant.id as string;
    ids.push(ownerRestaurantId);
    const ownerPlan = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO',
      name: `TEST Device Sig Owner Plan ${stamp}-${Math.random().toString(36).slice(2)}`,
      priceMonthly: 700000,
      maxBranches: 3,
      maxDevices: 20,
      maxUsers: 20,
      entitlements: {}
    });
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId: ownerRestaurantId,
      planId: ownerPlan.body.id,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      applications: ['POS_ADMIN']
    });
    await request(app.getHttpServer()).post('/api/v1/tenant-auth/set-initial-password').send({
      restaurantId: ownerRestaurantId, email: ownerEmail, activationToken: createRes.body.activationToken, newPassword: ownerPassword
    });
    const loginRes = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantId: ownerRestaurantId, password: ownerPassword, deviceType: 'POS_ADMIN' });
    expect(loginRes.body.requiresActivation).toBe(true);
    const keyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({
      restaurantId: ownerRestaurantId,
      allowedDeviceType: 'POS_ADMIN',
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    const activateRes = await request(app.getHttpServer()).post('/api/v1/tenant-auth/activate-device').send({
      activationSessionToken: loginRes.body.activationSessionToken,
      activationKey: keyRes.body.code,
      deviceType: 'POS_ADMIN',
      ...(withKey ? { publicKeyJwk: posAdminPublicKeyJwk } : {})
    });
    return activateRes.body.deviceToken as string;
  };

  const signPosAdmin = (method: string, path: string, body: string, timestamp = String(Date.now())) => {
    const bodyHash = require('crypto').createHash('sha256').update(body).digest('hex');
    const payload = `${method}\n${path}\n${timestamp}\n${bodyHash}`;
    const signature = cryptoSign('sha256', Buffer.from(payload, 'utf8'), { key: posAdminKeyPair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64');
    return { signature, timestamp };
  };

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(RazorpayGatewayService).useValue({
        isConfigured: () => true,
        createUpiQr: async () => ({ qrId: 'qr_sig_mock', imageUrl: 'https://rzp.io/img/sig_mock.png', status: 'active' }),
        listQrPayments: async () => [],
        createRefund: async () => ({ refundId: 'rfnd_sig_mock', status: 'pending', amountPaise: 100 })
      })
    );
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    platformToken = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;
    const res = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Device Signature ${stamp}`,
      ownerName: 'Device Sig Owner',
      ownerEmail: `devicesig-${stamp}@test.example.com`
    });
    restaurantId = res.body.restaurant.id;
    ids.push(restaurantId);
    const plan = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO',
      name: `TEST Device Sig Plan ${stamp}`,
      priceMonthly: 700000,
      maxBranches: 3,
      maxDevices: 20,
      maxUsers: 20,
      entitlements: { selfOrderKiosk: true }
    });
    planId = plan.body.id;
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId,
      planId,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      applications: APPS
    });
    await prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.create({ data: { restaurantId, status: 'ACTIVE' } }));
    await prisma.runAsTenant(restaurantId, (tx) =>
      tx.menuSnapshotItem.upsert({
        where: { restaurantId_externalItemId: { restaurantId, externalItemId: 'thali-1' } },
        create: { restaurantId, externalItemId: 'thali-1', name: 'Thali', basePrice: 10000, taxRate: 0, modifierGroups: [] },
        update: { basePrice: 10000 }
      })
    );
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: ids } } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { name: { contains: `Device Sig Owner Plan ${stamp}` } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('a key-registered kiosk is refused with no signature at all', async () => {
    const token = await issueKioskToken(true);
    const res = await authed('post', '/api/v1/payments/orders', token).send({ externalOrderId: `sig-missing-${stamp}`, lines: [{ externalItemId: 'thali-1', quantity: 1, selectedOptionIds: [] }] });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('DEVICE_SIGNATURE_REQUIRED');
  });

  it('a correctly signed request from the registered key succeeds', async () => {
    const token = await issueKioskToken(true);
    const body = JSON.stringify({ externalOrderId: `sig-ok-${stamp}`, lines: [{ externalItemId: 'thali-1', quantity: 1, selectedOptionIds: [] }] });
    const { signature, timestamp } = sign('POST', '/api/v1/payments/orders', body);
    const res = await authed('post', '/api/v1/payments/orders', token).set('x-device-signature', signature).set('x-device-timestamp', timestamp).set('Content-Type', 'application/json').send(body);
    expect(res.status).toBe(201);
  });

  it('a signature computed over a different body than the one sent is refused (tamper after signing)', async () => {
    const token = await issueKioskToken(true);
    const signedBody = JSON.stringify({ externalOrderId: `sig-tamper-${stamp}`, lines: [{ externalItemId: 'thali-1', quantity: 1, selectedOptionIds: [] }] });
    const { signature, timestamp } = sign('POST', '/api/v1/payments/orders', signedBody);
    const tamperedBody = JSON.stringify({ externalOrderId: `sig-tamper-${stamp}`, lines: [{ externalItemId: 'thali-1', quantity: 99, selectedOptionIds: [] }] });
    const res = await authed('post', '/api/v1/payments/orders', token).set('x-device-signature', signature).set('x-device-timestamp', timestamp).set('Content-Type', 'application/json').send(tamperedBody);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('DEVICE_SIGNATURE_INVALID');
  });

  it('a signature from a different key pair (a stolen token used on another machine) is refused', async () => {
    const token = await issueKioskToken(true);
    const attackerKeys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const body = JSON.stringify({ externalOrderId: `sig-wrongkey-${stamp}`, lines: [{ externalItemId: 'thali-1', quantity: 1, selectedOptionIds: [] }] });
    const timestamp = String(Date.now());
    const bodyHash = require('crypto').createHash('sha256').update(body).digest('hex');
    const payload = `POST\n/api/v1/payments/orders\n${timestamp}\n${bodyHash}`;
    const signature = cryptoSign('sha256', Buffer.from(payload, 'utf8'), { key: attackerKeys.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64');
    const res = await authed('post', '/api/v1/payments/orders', token).set('x-device-signature', signature).set('x-device-timestamp', timestamp).set('Content-Type', 'application/json').send(body);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('DEVICE_SIGNATURE_INVALID');
  });

  it('a stale timestamp is refused even with a correct signature', async () => {
    const token = await issueKioskToken(true);
    const body = JSON.stringify({ externalOrderId: `sig-stale-${stamp}`, lines: [{ externalItemId: 'thali-1', quantity: 1, selectedOptionIds: [] }] });
    const oldTimestamp = String(Date.now() - 5 * 60_000);
    const { signature } = sign('POST', '/api/v1/payments/orders', body, oldTimestamp);
    const res = await authed('post', '/api/v1/payments/orders', token).set('x-device-signature', signature).set('x-device-timestamp', oldTimestamp).set('Content-Type', 'application/json').send(body);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('DEVICE_SIGNATURE_STALE');
  });

  it('the same signed request replayed a second time is refused', async () => {
    const token = await issueKioskToken(true);
    const body = JSON.stringify({ externalOrderId: `sig-replay-${stamp}`, lines: [{ externalItemId: 'thali-1', quantity: 1, selectedOptionIds: [] }] });
    const { signature, timestamp } = sign('POST', '/api/v1/payments/orders', body);
    const first = await authed('post', '/api/v1/payments/orders', token).set('x-device-signature', signature).set('x-device-timestamp', timestamp).set('Content-Type', 'application/json').send(body);
    expect(first.status).toBe(201);
    const second = await authed('post', '/api/v1/payments/orders', token).set('x-device-signature', signature).set('x-device-timestamp', timestamp).set('Content-Type', 'application/json').send(body);
    expect(second.status).toBe(401);
    expect(second.body.code).toBe('DEVICE_SIGNATURE_REPLAYED');
  });

  it('a kiosk with no registered key still works unsigned (not yet re-activated since this shipped)', async () => {
    const token = await issueKioskToken(false);
    const res = await authed('post', '/api/v1/payments/orders', token).send({ externalOrderId: `sig-legacy-${stamp}`, lines: [{ externalItemId: 'thali-1', quantity: 1, selectedOptionIds: [] }] });
    expect(res.status).toBe(201);
  });

  it('a key-registered POS must also sign payment requests (the guard is not Kiosk-only)', async () => {
    const posToken = await issuePosToken(true);
    const order = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({ data: { restaurantId, externalOrderId: `sig-pos-${stamp}`, items: [], subtotal: 10000, taxAmount: 0, totalAmount: 10000, status: 'PAID' } })
    );
    const payment = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({ data: { provider: 'RAZORPAY', providerPaymentId: `pay_rzp_sig_pos_${stamp}`, orderId: order.id, restaurantId, providerOrderId: `pay_sig_pos_${stamp}`, amount: 10000, currency: 'INR', status: 'SUCCESS' } })
    );
    const path = `/api/v1/payments/${payment.id}/refund`;
    const unsigned = await authed('post', path, posToken).send({ amountPaise: 100, reason: 'x', requestedBy: 'x' });
    expect(unsigned.status).toBe(401);
    expect(unsigned.body.code).toBe('DEVICE_SIGNATURE_REQUIRED');

    const body = JSON.stringify({ amountPaise: 100, reason: 'x', requestedBy: 'x' });
    const { signature, timestamp } = signPos('POST', path, body);
    const signed = await authed('post', path, posToken).set('x-device-signature', signature).set('x-device-timestamp', timestamp).set('Content-Type', 'application/json').send(body);
    expect(signed.status).toBe(201);
  });

  it('a POS with no registered key still works unsigned', async () => {
    const posToken = await issuePosToken(false);
    const order = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({ data: { restaurantId, externalOrderId: `sig-pos-legacy-${stamp}`, items: [], subtotal: 5000, taxAmount: 0, totalAmount: 5000, status: 'PAID' } })
    );
    const payment = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({ data: { provider: 'RAZORPAY', providerPaymentId: `pay_rzp_sig_pos_legacy_${stamp}`, orderId: order.id, restaurantId, providerOrderId: `pay_sig_pos_legacy_${stamp}`, amount: 5000, currency: 'INR', status: 'SUCCESS' } })
    );
    const res = await authed('post', `/api/v1/payments/${payment.id}/refund`, posToken).send({ amountPaise: 100, reason: 'x', requestedBy: 'x' });
    expect(res.status).toBe(201);
  });

  it('a POS_ADMIN registered through the owner-login activate-device path must also sign payment requests', async () => {
    const token = await issuePosAdminTokenViaActivateDevice(true);
    const unsigned = await authed('get', '/api/v1/payments/tenant-summary', token);
    expect(unsigned.status).toBe(401);
    expect(unsigned.body.code).toBe('DEVICE_SIGNATURE_REQUIRED');

    const { signature, timestamp } = signPosAdmin('GET', '/api/v1/payments/tenant-summary', '');
    const signed = await authed('get', '/api/v1/payments/tenant-summary', token).set('x-device-signature', signature).set('x-device-timestamp', timestamp);
    expect(signed.status).toBe(200);
  });
});
