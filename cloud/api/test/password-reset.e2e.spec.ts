import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailService } from '../src/modules/notifications/email.service';

/**
 * BUG-142: a restaurant admin who forgot their password had no way back in short of asking the platform team.
 * Now: ask for a code by email, then use it to choose a new password.
 */
describe('Restaurant user "forgot password" (BUG-142)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `pw-reset-admin-${stamp}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  const ownerEmail = `pw-reset-owner-${stamp}@example.com`;
  const oldPassword = 'the-old-password-1';
  let restaurantId: string;
  let sent: Array<{ to: string; subject: string; html: string }> = [];

  const http = () => request(app.getHttpServer());
  const forgot = (email = ownerEmail) => http().post('/api/v1/tenant-auth/forgot-password').send({ restaurantId, email });
  const reset = (otp: string, newPassword: string, email = ownerEmail) => http().post('/api/v1/tenant-auth/reset-password').send({ restaurantId, email, otp, newPassword });
  const login = (password: string) => http().post('/api/v1/tenant-auth/login').send({ restaurantId, email: ownerEmail, password });
  const lastCode = () => /(\d{6})<\/span>/.exec(sent[sent.length - 1].html)![1];
  /** Lets the resend cooldown pass without waiting a minute. */
  const clearCooldown = () => prisma.runAsPlatform((tx) => tx.user.updateMany({ where: { restaurantId, email: ownerEmail }, data: { passwordResetSentAt: null } }));

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    vi.spyOn(app.get(EmailService), 'send').mockImplementation(async (to, subject, html) => {
      sent.push({ to, subject, html });
      return true;
    });
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    // Platform sign-in is now two-step (OTP emailed after password checks out); the spy above
    // captures that email the same as any tenant "forgot password" email, so the same
    // sent/lastCode() pair reads the code back.
    const adminLoginRes = await http().post('/api/v1/platform-auth/login').send({ email: adminEmail, password: adminPassword });
    const adminVerifyRes = await http().post('/api/v1/platform-auth/verify-otp').send({ otpToken: adminLoginRes.body.otpToken, otp: lastCode() });
    const token = adminVerifyRes.body.accessToken;
    const created = await http().post('/api/v1/restaurants').set('Authorization', `Bearer ${token}`).send({ name: `TEST Pw Reset ${stamp}`, mobile: `9${String(stamp).slice(-9)}`, ownerName: 'Reset Owner', ownerEmail });
    restaurantId = created.body.restaurant.id;
    await http().post('/api/v1/tenant-auth/set-initial-password').send({ restaurantId, email: ownerEmail, activationToken: created.body.activationToken, newPassword: oldPassword });
  }, 60_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('emails a 6-digit code, and the code lets the user choose a new password', async () => {
    sent = [];
    expect((await forgot()).status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(ownerEmail);

    // The code is stored only as a hash.
    const row = await prisma.runAsPlatform((tx) => tx.user.findFirstOrThrow({ where: { restaurantId, email: ownerEmail } }));
    expect(row.passwordResetHash).toBeTruthy();
    expect(row.passwordResetHash).not.toContain(lastCode());

    const done = await reset(lastCode(), 'a-brand-new-password-2');
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect((await login(oldPassword)).status).toBe(401);
    expect((await login('a-brand-new-password-2')).status).toBe(200);
  });

  it('a code works only once', async () => {
    sent = [];
    await clearCooldown();
    await forgot();
    const code = lastCode();
    expect((await reset(code, 'another-new-password-3')).status).toBe(200);
    expect((await reset(code, 'yet-another-password-4')).status).toBe(400);
  });

  it('answers the same for an address that has no account, and sends nothing', async () => {
    sent = [];
    const res = await forgot(`nobody-${stamp}@example.com`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it('a wrong code is refused, and after five wrong guesses the code is dropped', async () => {
    sent = [];
    await clearCooldown();
    await forgot();
    const good = lastCode();
    const wrong = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await reset(wrong, 'some-new-password-5')).status).toBe(400);
    // Even the right code no longer works: a new one has to be requested.
    expect((await reset(good, 'some-new-password-5')).status).toBe(400);
  });

  it('an expired code is refused', async () => {
    sent = [];
    await clearCooldown();
    await forgot();
    await prisma.runAsPlatform((tx) => tx.user.updateMany({ where: { restaurantId, email: ownerEmail }, data: { passwordResetExpiresAt: new Date(Date.now() - 1000) } }));
    expect((await reset(lastCode(), 'some-new-password-6')).status).toBe(400);
  });

  it('asking again straight away does not send a second code', async () => {
    sent = [];
    await clearCooldown();
    await forgot();
    await forgot();
    expect(sent).toHaveLength(1);
  });

  it('B2-047: does not wait for the mail server — a slow send must not slow the response, closing the timing side-channel that revealed which emails have accounts', async () => {
    await clearCooldown();
    sent = [];
    const emailService = app.get(EmailService);
    let settleSend!: () => void;
    const sendSettled = new Promise<void>((resolve) => { settleSend = resolve; });
    // Simulate a slow mail server (the real bug: SMTP round-trips took ~5.1s for a real account).
    // mockImplementationOnce overrides only this one call — it self-reverts to beforeAll's fast
    // mock afterward, so later tests are unaffected (mockRestore() would instead undo beforeAll's
    // mock entirely, falling through to the real, unmocked EmailService).
    vi.spyOn(emailService, 'send').mockImplementationOnce(async (to, subject, html) => {
      await new Promise((r) => setTimeout(r, 400));
      sent.push({ to, subject, html });
      settleSend();
      return true;
    });

    const t0 = Date.now();
    const res = await forgot();
    const elapsed = Date.now() - t0;

    expect(res.status).toBe(200);
    // The response must not have waited on the 400ms "mail server" — proves send() is
    // fire-and-forget, not awaited in the request path.
    expect(elapsed).toBeLessThan(200);

    await sendSettled; // let the deliberately slow send actually finish before the test ends
    expect(sent).toHaveLength(1);
  });

  it('a successful reset signs the user out everywhere', async () => {
    sent = [];
    await clearCooldown();
    const session = await login('another-new-password-3');
    expect(session.status).toBe(200);
    const before = await prisma.runAsPlatform((tx) => tx.tenantRefreshToken.count({ where: { restaurantId, revokedAt: null } }));
    expect(before).toBeGreaterThan(0);
    await forgot();
    expect((await reset(lastCode(), 'final-new-password-7')).status).toBe(200);
    const after = await prisma.runAsPlatform((tx) => tx.tenantRefreshToken.count({ where: { restaurantId, revokedAt: null } }));
    expect(after).toBe(0);
  });

  it('rejects a weak new password and a malformed code', async () => {
    expect((await reset('123456', 'short')).status).toBe(400);
    expect((await reset('12ab56', 'long-enough-password-8')).status).toBe(400);
  });
});
