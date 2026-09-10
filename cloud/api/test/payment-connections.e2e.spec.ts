import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

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
    app = await createTestApp();
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
});
