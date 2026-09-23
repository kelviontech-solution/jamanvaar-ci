import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser, extractCookie } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailService } from '../src/modules/notifications/email.service';

describe('Platform authentication + authorization (Phase 1a)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `test-auth-${Date.now()}@example.com`;
  const password = 'correct-horse-battery-staple';
  let sent: Array<{ to: string; subject: string; html: string }> = [];

  const http = () => request(app.getHttpServer());
  const lastCode = () => /(\d{6})<\/span>/.exec(sent[sent.length - 1].html)![1];

  /**
   * Sign-in is now a two-step OTP flow (email+password -> emailed code -> verify-otp). Every
   * existing test that used to get a session straight from /login needs both steps, so this
   * mirrors what the real super-admin-web client does: POST login, read the code the mocked
   * EmailService "sent", then POST verify-otp with it.
   */
  const completeLogin = async (loginEmail: string, loginPassword: string) => {
    sent = [];
    const loginRes = await http().post('/api/v1/platform-auth/login').send({ email: loginEmail, password: loginPassword });
    if (loginRes.status !== 200) return loginRes;
    return http().post('/api/v1/platform-auth/verify-otp').send({ otpToken: loginRes.body.otpToken, otp: lastCode() });
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    vi.spyOn(app.get(EmailService), 'send').mockImplementation(async (to, subject, html) => {
      sent.push({ to, subject, html });
      return true;
    });
    await createTestPlatformUser(prisma, { email, password });
  });

  afterAll(async () => {
    await prisma.platformUser.deleteMany({ where: { email } });
    await app.close();
  });

  it('rejects an unauthenticated request to a protected platform route', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/platform/me');
    expect(res.status).toBe(401);
  });

  it('rejects login with a wrong password', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/platform-auth/login')
      .send({ email, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('rejects login for an email that does not exist (same response as wrong password)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/platform-auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('login with correct credentials sends an OTP and does not yet grant a session', async () => {
    sent = [];
    const loginRes = await http().post('/api/v1/platform-auth/login').send({ email, password });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.status).toBe('OTP_REQUIRED');
    expect(loginRes.body.otpToken).toBeTypeOf('string');
    expect(loginRes.body.maskedEmail).toContain('@');
    expect(loginRes.body).not.toHaveProperty('accessToken');
    expect(loginRes.headers['set-cookie']).toBeUndefined();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(email);
    // The code is stored only as a hash.
    const row = await prisma.platformUser.findUniqueOrThrow({ where: { email } });
    expect(row.loginOtpHash).toBeTruthy();
    expect(row.loginOtpHash).not.toContain(lastCode());
  });

  it('the emailed code completes sign-in: receives an access token, and can reach a protected route', async () => {
    const verifyRes = await completeLogin(email, password);

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.accessToken).toBeTypeOf('string');
    expect(verifyRes.body.user.email).toBe(email);
    // The password hash must never appear in any response.
    expect(JSON.stringify(verifyRes.body)).not.toContain('passwordHash');

    const refreshCookie = extractCookie(verifyRes.headers['set-cookie'], 'jamanvaar_platform_refresh');
    expect(refreshCookie).toBeDefined();

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/platform/me')
      .set('Authorization', `Bearer ${verifyRes.body.accessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.email).toBe(email);
    expect(meRes.body).not.toHaveProperty('passwordHash');
  });

  it('a wrong OTP is refused, and after five wrong guesses the code is dropped', async () => {
    sent = [];
    const loginRes = await http().post('/api/v1/platform-auth/login').send({ email, password });
    const { otpToken } = loginRes.body;
    const good = lastCode();
    const wrong = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      expect((await http().post('/api/v1/platform-auth/verify-otp').send({ otpToken, otp: wrong })).status).toBe(401);
    }
    // Even the right code no longer works: a new one has to be requested.
    expect((await http().post('/api/v1/platform-auth/verify-otp').send({ otpToken, otp: good })).status).toBe(401);
  });

  it('resend-otp does not send a second code within the cooldown, but does after it', async () => {
    sent = [];
    const loginRes = await http().post('/api/v1/platform-auth/login').send({ email, password });
    expect(sent).toHaveLength(1);

    await http().post('/api/v1/platform-auth/resend-otp').send({ otpToken: loginRes.body.otpToken });
    expect(sent).toHaveLength(1);

    await prisma.platformUser.updateMany({ where: { email }, data: { loginOtpSentAt: null } });
    await http().post('/api/v1/platform-auth/resend-otp').send({ otpToken: loginRes.body.otpToken });
    expect(sent).toHaveLength(2);
  });

  it('rejects a garbage/invalid bearer token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/platform/me')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('rejects a token signed for a different (future tenant) issuer/audience, even with the correct secret', async () => {
    // Simulates what a future TenantAuthModule would mint — proves the guard
    // enforces issuer/audience, not merely "is this a validly-signed JWT".
    const config = app.get(ConfigService);
    const jwt = app.get(JwtService);
    const forgedTenantToken = jwt.sign(
      { sub: 'some-tenant-user-id', email: 'owner@somerestaurant.com' },
      {
        secret: config.get<string>('JWT_ACCESS_SECRET'), // same secret on purpose
        issuer: 'jamanvaar-tenant',
        audience: 'jamanvaar-tenant',
        expiresIn: '15m'
      }
    );

    const res = await request(app.getHttpServer())
      .get('/api/v1/platform/me')
      .set('Authorization', `Bearer ${forgedTenantToken}`);

    expect(res.status).toBe(401);
  });

  it('rotates refresh tokens and rejects a refresh token replayed after rotation', async () => {
    const loginRes = await completeLogin(email, password);
    const firstRefreshCookie = extractCookie(loginRes.headers['set-cookie'], 'jamanvaar_platform_refresh')!;

    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/platform-auth/refresh')
      .set('Cookie', [`jamanvaar_platform_refresh=${firstRefreshCookie}`]);
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeTypeOf('string');

    // Replaying the original (now-rotated-out) refresh token must fail.
    const replayRes = await request(app.getHttpServer())
      .post('/api/v1/platform-auth/refresh')
      .set('Cookie', [`jamanvaar_platform_refresh=${firstRefreshCookie}`]);
    expect(replayRes.status).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    const loginRes = await completeLogin(email, password);
    const refreshCookie = extractCookie(loginRes.headers['set-cookie'], 'jamanvaar_platform_refresh')!;

    const logoutRes = await request(app.getHttpServer())
      .post('/api/v1/platform-auth/logout')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .set('Cookie', [`jamanvaar_platform_refresh=${refreshCookie}`]);
    expect(logoutRes.status).toBe(200);

    const refreshAfterLogout = await request(app.getHttpServer())
      .post('/api/v1/platform-auth/refresh')
      .set('Cookie', [`jamanvaar_platform_refresh=${refreshCookie}`]);
    expect(refreshAfterLogout.status).toBe(401);
  });

  it('SEC-011: never accepts an arbitrary password outside production, and never rewrites a stored hash to match one', async () => {
    // Regression test for a real authentication bypass that used to live in
    // PlatformAuthService.login: whenever NODE_ENV !== 'production' (the zod
    // default in env.validation.ts — so this was the unconfigured case, not
    // an opt-in) AND the email was the literal, publicly-documented
    // 'superadmin@jamanvaar.app', ANY password logged in successfully and
    // silently overwrote the stored hash to match whatever had just been
    // typed — a full, permanent account takeover path on the platform's most
    // privileged account. That whole branch is now deleted rather than
    // reworked, so it can no longer trigger for any email; a distinct test
    // account (not the real seeded superadmin row, to avoid disturbing
    // shared dev/demo state) exercises the same bcrypt.compare-only path.
    // NODE_ENV is not forced to 'production' here on purpose: this suite's
    // default environment (unset / 'test') is exactly the condition the
    // bypass used to trigger under, so this proves the fix rather than
    // routing around it.
    const testEmail = `sec-011-${Date.now()}@example.com`;
    const realPassword = 'the-real-super-admin-password';
    await createTestPlatformUser(prisma, { email: testEmail, password: realPassword });

    try {
      const guessRes = await request(app.getHttpServer())
        .post('/api/v1/platform-auth/login')
        .send({ email: testEmail, password: 'any-random-guess-1' });
      expect(guessRes.status).toBe(401);

      // The stored hash must be untouched by that rejected attempt — the real
      // password still works, and the guessed one still doesn't.
      const secondGuessRes = await request(app.getHttpServer())
        .post('/api/v1/platform-auth/login')
        .send({ email: testEmail, password: 'any-random-guess-1' });
      expect(secondGuessRes.status).toBe(401);

      const realLoginRes = await completeLogin(testEmail, realPassword);
      expect(realLoginRes.status).toBe(200);
      expect(realLoginRes.body.accessToken).toBeTypeOf('string');
    } finally {
      await prisma.platformUser.deleteMany({ where: { email: testEmail } });
    }
  });

  it('creates an audit record for login and logout', async () => {
    const loginRes = await completeLogin(email, password);

    const user = await prisma.platformUser.findUniqueOrThrow({ where: { email } });
    const loginAudit = await prisma.auditLog.findFirst({
      where: { actorType: 'PLATFORM', actorId: user.id, action: 'PLATFORM_LOGIN' },
      orderBy: { createdAt: 'desc' }
    });
    expect(loginAudit).toBeTruthy();
    expect(JSON.stringify(loginAudit)).not.toMatch(/password/i);

    const refreshCookie = extractCookie(loginRes.headers['set-cookie'], 'jamanvaar_platform_refresh')!;
    await request(app.getHttpServer())
      .post('/api/v1/platform-auth/logout')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .set('Cookie', [`jamanvaar_platform_refresh=${refreshCookie}`]);

    const logoutAudit = await prisma.auditLog.findFirst({
      where: { actorType: 'PLATFORM', actorId: user.id, action: 'PLATFORM_LOGOUT' },
      orderBy: { createdAt: 'desc' }
    });
    expect(logoutAudit).toBeTruthy();
  });
});
