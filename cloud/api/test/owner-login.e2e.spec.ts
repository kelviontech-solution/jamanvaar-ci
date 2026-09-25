import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailService } from '../src/modules/notifications/email.service';

describe('Owner-only restaurant-code login (Phase 3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let platformToken: string;
  const stamp = Date.now();
  const adminEmail = `test-ownerlogin-admin-${stamp}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  const ownerPassword = 'the-owners-password-1';
  const ownerEmail = `owner-login-${stamp}@example.com`;
  let restaurantId: string;
  let restaurantCode: string;
  const createdRestaurantIds: string[] = [];
  const sent: Array<{ to: string; subject: string; html: string }> = [];
  const lastCode = () => /(\d{6})<\/span>/.exec(sent[sent.length - 1].html)![1];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    // Installed after platformLogin's own OTP round trip so that flow still uses
    // createTestApp()'s default spy (captures via lastOtpByEmail) — this one only needs to
    // capture the owner forgot-password emails that come after this point.
    platformToken = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;
    vi.spyOn(app.get(EmailService), 'send').mockImplementation(async (to, subject, html) => {
      sent.push({ to, subject, html });
      return true;
    });

    const create = await request(app.getHttpServer()).post('/api/v1/restaurants').set('Authorization', `Bearer ${platformToken}`).send({
      name: `TEST Owner Login ${stamp}`, mobile: `9${String(stamp).slice(-9)}`, ownerName: 'Owner', ownerEmail
    });
    restaurantId = create.body.restaurant.id;
    restaurantCode = create.body.restaurant.restaurantCode;
    createdRestaurantIds.push(restaurantId);

    await request(app.getHttpServer()).post('/api/v1/tenant-auth/set-initial-password').send({
      restaurantId, email: ownerEmail, activationToken: create.body.activationToken, newPassword: ownerPassword
    });
  });

  afterAll(async () => {
    if (createdRestaurantIds.length) await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('logs the owner in with just restaurantCode + password, no email', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantCode, password: ownerPassword });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(ownerEmail);
    expect(res.body.user.role).toBe('OWNER');
    expect(res.body.accessToken).toBeDefined();
  });

  it('rejects the wrong password with the same generic message the email login uses', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantCode, password: 'not-the-password' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid/i);
  });

  it('404s for an unknown restaurantCode', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantCode: 'JM6000000099', password: ownerPassword });
    expect(res.status).toBe(404);
  });

  it('logs the owner in with the internal restaurantId directly (no restaurantCode needed)', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantId, password: ownerPassword });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('OWNER');
  });

  it('rejects login-owner when neither restaurantCode nor restaurantId is given', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ password: ownerPassword });
    expect(res.status).toBe(400);
  });

  it('locks the owner account out after enough wrong passwords, same as email-login', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantCode, password: `wrong-${i}` });
    }
    const res = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantCode, password: ownerPassword });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/too many failed attempts/i);
  });

  it('forgot-password-owner returns the masked owner email and actually sends a code', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/tenant-auth/forgot-password-owner').send({ restaurantCode });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.maskedEmail).toMatch(/^.{1,4}\*+.{0,2}@example\.com$/);
    expect(res.body.maskedEmail).not.toBe(ownerEmail);
    expect(sent[sent.length - 1].to).toBe(ownerEmail);
  });

  it('404s forgot-password-owner for an unknown restaurantCode', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/tenant-auth/forgot-password-owner').send({ restaurantCode: 'JM6000000098' });
    expect(res.status).toBe(404);
  });

  it('a full restaurant-code reset round-trip changes the owner password and the new one works with login-owner', async () => {
    // A fresh restaurant, not the one the lockout test above already locked — resetPassword
    // (existing, BUG-142, untouched by this phase) does not clear failedLoginAttempts/
    // lockedUntil on success, so reusing that restaurant would fail this test's final login
    // for a reason unrelated to what this test is actually proving.
    const roundTripOwnerEmail = `owner-roundtrip-${stamp}@example.com`;
    const create = await request(app.getHttpServer()).post('/api/v1/restaurants').set('Authorization', `Bearer ${platformToken}`).send({
      name: `TEST Owner Roundtrip ${stamp}`, mobile: `8${String(stamp).slice(-9)}`, ownerName: 'Owner', ownerEmail: roundTripOwnerEmail
    });
    const roundTripRestaurantId = create.body.restaurant.id;
    const roundTripRestaurantCode = create.body.restaurant.restaurantCode;
    createdRestaurantIds.push(roundTripRestaurantId);
    await request(app.getHttpServer()).post('/api/v1/tenant-auth/set-initial-password').send({
      restaurantId: roundTripRestaurantId, email: roundTripOwnerEmail, activationToken: create.body.activationToken, newPassword: ownerPassword
    });

    await request(app.getHttpServer()).post('/api/v1/tenant-auth/forgot-password-owner').send({ restaurantCode: roundTripRestaurantCode });
    const otp = lastCode();
    const newPassword = 'a-brand-new-owner-password-1';
    const reset = await request(app.getHttpServer()).post('/api/v1/tenant-auth/reset-password-owner').send({ restaurantCode: roundTripRestaurantCode, otp, newPassword });
    expect(reset.status).toBe(200);

    const login = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantCode: roundTripRestaurantCode, password: newPassword });
    expect(login.status).toBe(200);
  });

  it('forgot-password-owner accepts an internal restaurantId directly (no restaurantCode needed)', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/tenant-auth/forgot-password-owner').send({ restaurantId });
    expect(res.status).toBe(200);
    expect(res.body.maskedEmail).toBeDefined();
  });
});
