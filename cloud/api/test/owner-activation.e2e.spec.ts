import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailService } from '../src/modules/notifications/email.service';

/** An invited owner activates with the Restaurant ID and the invitation token, then signs in with the password they chose. */
describe('owner first-time activation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const stamp = Date.now();
  const adminEmail = `test-activation-admin-${stamp}@example.com`;
  const ownerEmail = `activate-${stamp}@test.example.com`;
  const password = 'Correct-Horse-9-Battery';
  const ids: string[] = [];
  const sent: Array<{ to: string; subject: string; html: string }> = [];
  let restaurantCode = '';
  let invitationToken = '';

  beforeAll(async () => {
    process.env.RESTAURANT_ADMIN_URL = 'https://admin.example.test';
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    token = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;
    vi.spyOn(app.get(EmailService), 'send').mockImplementation(async (to, subject, html) => {
      sent.push({ to, subject, html });
      return true;
    });
    const mobile = `6${String(stamp).slice(-9)}`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/restaurants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `TEST Activate ${stamp}`, mobile, ownerName: 'Lata', ownerEmail });
    expect(res.status).toBe(201);
    ids.push(res.body.restaurant.id);
    restaurantCode = res.body.restaurant.restaurantCode;
    invitationToken = res.body.activationToken;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: ids } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('the welcome email links straight to the set-password screen with the restaurant, email and token filled in', () => {
    const mail = sent.find((m) => m.to === ownerEmail)!;
    const link = mail.html.match(/href="([^"]*activate=1[^"]*)"/)?.[1];
    expect(link).toBeDefined();
    const url = new URL(link!.replace(/&amp;/g, '&'));
    expect(url.origin).toBe('https://admin.example.test');
    expect(url.searchParams.get('code')).toBe(restaurantCode);
    expect(url.searchParams.get('email')).toBe(ownerEmail);
    expect(url.searchParams.get('token')).toBe(invitationToken);
  });

  it('forgot password for an owner who has not activated yet sends no code and says activation is needed', async () => {
    const before = sent.length;
    const res = await request(app.getHttpServer()).post('/api/v1/tenant-auth/forgot-password-owner').send({ restaurantCode });
    expect(res.status).toBe(200);
    expect(res.body.activationRequired).toBe(true);
    expect(sent.length).toBe(before);
  });

  it('a wrong invitation token is refused', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/activate-owner')
      .send({ restaurantCode, email: ownerEmail, activationToken: 'not-the-token', newPassword: password });
    expect(res.status).toBe(401);
  });

  it('the right token sets the password, and the owner then signs in with the Restaurant ID and password', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/activate-owner')
      .send({ restaurantCode, email: ownerEmail, activationToken: invitationToken, newPassword: password });
    expect(res.status).toBe(200);

    const login = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantCode, password });
    expect(login.status).toBe(200);
  });

  it('the invitation cannot be used a second time', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/activate-owner')
      .send({ restaurantCode, email: ownerEmail, activationToken: invitationToken, newPassword: 'Another-Horse-9-Battery' });
    expect(res.status).toBe(409);
  });

  it('after activation, forgot password sends a code to the owner', async () => {
    const before = sent.length;
    const res = await request(app.getHttpServer()).post('/api/v1/tenant-auth/forgot-password-owner').send({ restaurantCode });
    expect(res.body.activationRequired).toBe(false);
    await new Promise((r) => setTimeout(r, 50));
    expect(sent.length).toBe(before + 1);
    expect(sent[sent.length - 1].to).toBe(ownerEmail);
  });
});
