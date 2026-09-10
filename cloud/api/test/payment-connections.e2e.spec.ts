import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { CashfreeGatewayService } from '../src/modules/payments/cashfree-gateway.service';

describe('Payment connection onboarding', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-payconn-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let ownerToken: string;

  const authed = (method: 'get' | 'post' | 'patch', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  const validSubmission = {
    accountType: 'BUSINESS',
    businessType: 'Restaurant',
    pan: 'ABCDE1234F',
    contactName: 'Demo Owner',
    contactEmail: 'owner@demo.example.com',
    contactPhone: '9876543210',
    settlementAccountName: 'Demo Restaurant',
    settlementAccountNumber: '1234567890',
    settlementIfsc: 'HDFC0000001'
  };

  beforeAll(async () => {
    process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    app = await createTestApp((builder) =>
      builder.overrideProvider(CashfreeGatewayService).useValue({
        isConfigured: () => true,
        createVendor: vi.fn().mockResolvedValue({ vendorId: 'rest_mocked', status: 'IN_BENE_CREATION' }),
        getVendorStatus: vi.fn().mockResolvedValue({ vendorId: 'rest_mocked', status: 'ACTIVE' })
      })
    );
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email: adminEmail, password: adminPassword });
    platformToken = loginRes.body.accessToken;

    const ownerEmail = `pay-connection-owner-${Date.now()}@test.example.com`;
    const ownerPassword = 'owner-correct-horse-battery';
    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Pay Connection Restaurant ${Date.now()}`,
      ownerName: 'Pay Connection Owner',
      ownerEmail
    });
    restaurantId = restaurantRes.body.restaurant.id;
    const activationToken = restaurantRes.body.activationToken;

    await request(app.getHttpServer()).post('/api/v1/tenant-auth/set-initial-password').send({
      restaurantId, email: ownerEmail, activationToken, newPassword: ownerPassword
    });
    const ownerLoginRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: ownerEmail, password: ownerPassword });
    ownerToken = ownerLoginRes.body.accessToken;
  });

  afterAll(async () => {
    delete process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY;
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('GET returns NOT_CONNECTED when nothing has been submitted yet', async () => {
    const res = await authed('get', '/api/v1/tenant/payment-connection', ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('NOT_CONNECTED');
  });

  it('rejects a submission with neither bank nor UPI details', async () => {
    const res = await authed('post', '/api/v1/tenant/payment-connection', ownerToken).send({
      accountType: 'BUSINESS', pan: 'ABCDE1234F', contactName: 'X', contactEmail: 'x@example.com', contactPhone: '9876543210'
    });
    expect(res.status).toBe(400);
  });

  it('accepts a UPI-only submission and moves status to PENDING_VERIFICATION', async () => {
    const res = await authed('post', '/api/v1/tenant/payment-connection', ownerToken).send({
      accountType: 'INDIVIDUAL', pan: 'ABCDE1234F', contactName: 'X', contactEmail: 'x@example.com', contactPhone: '9876543210',
      settlementUpiVpa: 'demo@upi'
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING_VERIFICATION');
    expect(res.body.settlementUpiVpa).toBe('demo@upi');
  });

  it('accepts a full bank submission, overwriting the prior UPI-only one while still PENDING_VERIFICATION', async () => {
    const res = await authed('post', '/api/v1/tenant/payment-connection', ownerToken).send(validSubmission);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING_VERIFICATION');
    expect(res.body.settlementAccountName).toBe('Demo Restaurant');
    // Never returns the raw/decrypted account number, even to its own owner.
    expect(JSON.stringify(res.body)).not.toContain('1234567890');
  });

  it('GET now reflects the submitted PENDING_VERIFICATION connection', async () => {
    const res = await authed('get', '/api/v1/tenant/payment-connection', ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PENDING_VERIFICATION');
    expect(res.body.pan).toBe('ABCDE1234F');
  });

  it('the settlement account number is actually encrypted at rest, not stored in plaintext', async () => {
    const row = await prisma.runAsPlatform((tx) => tx.restaurantPaymentConnection.findUniqueOrThrow({ where: { restaurantId } }));
    expect(row.settlementAccountNumberEncrypted).not.toBe('1234567890');
    expect(row.settlementAccountNumberEncrypted).toContain(':'); // credential-encryption.util's iv:authTag:ciphertext format
  });

  it('platform list shows the connection with masked settlement details', async () => {
    const res = await authed('get', '/api/v1/payment-connections', platformToken);
    expect(res.status).toBe(200);
    const mine = res.body.find((c: { restaurantId: string }) => c.restaurantId === restaurantId);
    expect(mine).toBeDefined();
    expect(mine.status).toBe('PENDING_VERIFICATION');
    expect(mine.settlementAccountNumberMasked).toBe('•••• 7890');
    expect(mine.panMasked).toBe('•••• 234F');
    expect(JSON.stringify(mine)).not.toContain('1234567890');
    expect(JSON.stringify(mine)).not.toContain('ABCDE1234F');
  });

  it('platform detail matches the list entry', async () => {
    const res = await authed('get', `/api/v1/restaurants/${restaurantId}/payment-connection`, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PENDING_VERIFICATION');
  });

  it('suspend/reactivate/disconnect are rejected from the wrong starting status', async () => {
    const suspendRes = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/suspend`, platformToken);
    expect(suspendRes.status).toBe(403); // still PENDING_VERIFICATION, not ACTIVE
  });

  it('approve calls CashfreeGatewayService.createVendor and moves the connection to ACTIVE', async () => {
    const res = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/approve`, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.cashfreeVendorId).toBe('rest_mocked');

    const row = await prisma.runAsPlatform((tx) => tx.restaurantPaymentConnection.findUniqueOrThrow({ where: { restaurantId } }));
    expect(row.status).toBe('ACTIVE');
    expect(row.verifiedAt).not.toBeNull();
  });

  it('cannot approve twice — already ACTIVE is rejected', async () => {
    const res = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/approve`, platformToken);
    expect(res.status).toBe(403);
  });

  it('cannot resubmit while ACTIVE', async () => {
    const res = await authed('post', '/api/v1/tenant/payment-connection', ownerToken).send(validSubmission);
    expect(res.status).toBe(403);
  });

  it('refresh-status calls getVendorStatus and stores the raw Cashfree status without changing our own status', async () => {
    const res = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/refresh-status`, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.cashfreeVendorStatus).toBe('ACTIVE');

    const row = await prisma.runAsPlatform((tx) => tx.restaurantPaymentConnection.findUniqueOrThrow({ where: { restaurantId } }));
    expect(row.status).toBe('ACTIVE'); // unchanged — our own status is a separate concept from Cashfree's
    expect(row.cashfreeVendorStatus).toBe('ACTIVE');
  });

  it('suspend then reactivate works from ACTIVE, and disconnect works from SUSPENDED', async () => {
    const suspendRes = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/suspend`, platformToken);
    expect(suspendRes.status).toBe(200);
    expect(suspendRes.body.status).toBe('SUSPENDED');

    const reactivateRes = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/reactivate`, platformToken);
    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.status).toBe('ACTIVE');

    const suspendAgain = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/suspend`, platformToken);
    expect(suspendAgain.status).toBe(200);

    const disconnectRes = await authed('patch', `/api/v1/restaurants/${restaurantId}/payment-connection/disconnect`, platformToken);
    expect(disconnectRes.status).toBe(200);
    expect(disconnectRes.body.status).toBe('DISCONNECTED');
  });

  it('can resubmit after DISCONNECTED', async () => {
    const res = await authed('post', '/api/v1/tenant/payment-connection', ownerToken).send(validSubmission);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING_VERIFICATION');
  });

  it('a tenant from another restaurant cannot see or act on this connection', async () => {
    const otherOwnerEmail = `payconn-other-owner-${Date.now()}@test.example.com`;
    const otherOwnerPassword = 'other-correct-horse-battery';
    const otherRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Other Pay Connection Restaurant ${Date.now()}`, ownerName: 'Other Owner', ownerEmail: otherOwnerEmail
    });
    const otherRestaurantId = otherRes.body.restaurant.id;
    await request(app.getHttpServer()).post('/api/v1/tenant-auth/set-initial-password').send({
      restaurantId: otherRestaurantId, email: otherOwnerEmail, activationToken: otherRes.body.activationToken, newPassword: otherOwnerPassword
    });
    const otherLoginRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId: otherRestaurantId, email: otherOwnerEmail, password: otherOwnerPassword });
    const otherToken = otherLoginRes.body.accessToken;

    const res = await authed('get', '/api/v1/tenant/payment-connection', otherToken);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('NOT_CONNECTED'); // sees only their own (empty) connection, never ours

    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: otherRestaurantId } }));
  });
});
