import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser, extractCookie } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailService } from '../src/modules/notifications/email.service';

/**
 * BUG-093 / BUG-094: pressing "Revoke" on a session only stopped that session from
 * renewing; its 15-minute access token kept working, so revoking your own session
 * visibly did nothing. A revoked session must stop working at once, the list must
 * show one row per login (not one per token rotation) and mark the current one.
 */
describe('Platform sessions (BUG-093/094)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `test-sessions-${Date.now()}@example.com`;
  const otherEmail = `test-sessions-other-${Date.now()}@example.com`;
  const password = 'correct-horse-battery-staple';
  let sent: Array<{ to: string; subject: string; html: string }> = [];
  const lastCode = () => /(\d{6})<\/span>/.exec(sent[sent.length - 1].html)![1];

  /**
   * The session (and its device/location metadata) is now created in verifyOtp(), not login() —
   * the request that carries User-Agent / proxy headers has to be the verify-otp call, not the
   * initial email+password one, or every device/location assertion below would see nothing.
   */
  const login = async (
    who = email,
    userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
    extraHeaders: Record<string, string> = {}
  ) => {
    sent = [];
    const loginRes = await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email: who, password });
    expect(loginRes.status).toBe(200);
    let verifyReq = request(app.getHttpServer()).post('/api/v1/platform-auth/verify-otp').set('User-Agent', userAgent);
    for (const [key, value] of Object.entries(extraHeaders)) verifyReq = verifyReq.set(key, value);
    const res = await verifyReq.send({ otpToken: loginRes.body.otpToken, otp: lastCode() });
    expect(res.status).toBe(200);
    return { token: res.body.accessToken as string, refreshCookie: extractCookie(res.headers['set-cookie'], 'jamanvaar_platform_refresh') as string };
  };
  const as = (token: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`),
    delete: (url: string) => request(app.getHttpServer()).delete(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) => request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`)
  });
  const refresh = (cookie: string) =>
    request(app.getHttpServer()).post('/api/v1/platform-auth/refresh').set('Cookie', `jamanvaar_platform_refresh=${cookie}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    // Shadow the central EmailService spy so this file's `login()` helper can read the emailed
    // OTP straight off `sent`, the same way platform-auth.e2e.spec.ts does.
    vi.spyOn(app.get(EmailService), 'send').mockImplementation(async (to, subject, html) => {
      sent.push({ to, subject, html });
      return true;
    });
    await createTestPlatformUser(prisma, { email, password });
    await createTestPlatformUser(prisma, { email: otherEmail, password });
  });

  afterAll(async () => {
    await prisma.platformUser.deleteMany({ where: { email: { in: [email, otherEmail] } } });
    await app.close();
  });

  it('lists one row per login, marks the current one and describes the device', async () => {
    const a = await login(email, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36');
    const b = await login(email, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1');

    const list = await as(a.token).get('/api/v1/platform/sessions');
    expect(list.status).toBe(200);
    const mine = list.body.filter((s: any) => s.current);
    expect(mine).toHaveLength(1);
    expect(list.body.length).toBeGreaterThanOrEqual(2);
    const current = mine[0];
    expect(current.device).toMatch(/Chrome/);
    expect(current.device).toMatch(/Windows/);
    expect(list.body.some((s: any) => /iPhone|iOS/.test(s.device))).toBe(true);
    expect(current.startedAt).toBeTruthy();
    expect(current.lastActiveAt).toBeTruthy();

    await as(a.token).delete(`/api/v1/platform/sessions/${current.id}`);
    await as(b.token).post('/api/v1/platform/sessions/revoke-others');
  });

  it('a session that renews its login is still ONE row, with an unchanged start time', async () => {
    const a = await login();
    const before = (await as(a.token).get('/api/v1/platform/sessions')).body.find((s: any) => s.current);

    const r1 = await refresh(a.refreshCookie);
    expect(r1.status).toBe(200);
    const cookie2 = extractCookie(r1.headers['set-cookie'], 'jamanvaar_platform_refresh') as string;
    const r2 = await refresh(cookie2);
    expect(r2.status).toBe(200);

    const after = await as(r2.body.accessToken).get('/api/v1/platform/sessions');
    const rows = after.body.filter((s: any) => s.id === before.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].startedAt).toBe(before.startedAt);
    expect(rows[0].current).toBe(true);
  });

  it('revoking ANOTHER session cuts it off immediately, access token and renewal alike', async () => {
    const a = await login();
    const b = await login();
    const list = await as(a.token).get('/api/v1/platform/sessions');
    // b's session is the one that is not "current" from a's point of view and is the newest other row
    const bSession = list.body.find((s: any) => !s.current && s.id);
    const bView = await as(b.token).get('/api/v1/platform/sessions');
    const bId = bView.body.find((s: any) => s.current).id;
    expect(bSession).toBeTruthy();

    expect((await as(b.token).get('/api/v1/platform/me')).status).toBe(200);

    const revoke = await as(a.token).delete(`/api/v1/platform/sessions/${bId}`);
    expect(revoke.status).toBe(200);
    expect(revoke.body.success).toBe(true);
    expect(revoke.body.current).toBe(false);

    const blocked = await as(b.token).get('/api/v1/platform/me');
    expect(blocked.status).toBe(401);
    expect(blocked.body.code).toBe('SESSION_REVOKED');
    expect((await refresh(b.refreshCookie)).status).toBe(401);

    expect((await as(a.token).get('/api/v1/platform/me')).status).toBe(200);
  });

  it('revoking your OWN session signs you out at once and says so', async () => {
    const a = await login();
    const cur = (await as(a.token).get('/api/v1/platform/sessions')).body.find((s: any) => s.current);
    const revoke = await as(a.token).delete(`/api/v1/platform/sessions/${cur.id}`);
    expect(revoke.status).toBe(200);
    expect(revoke.body.current).toBe(true);

    expect((await as(a.token).get('/api/v1/platform/me')).status).toBe(401);
    expect((await refresh(a.refreshCookie)).status).toBe(401);
  });

  it('"sign out all other sessions" keeps only this one', async () => {
    const a = await login();
    const b = await login();
    const c = await login();
    const res = await as(a.token).post('/api/v1/platform/sessions/revoke-others');
    expect(res.status).toBe(201);
    expect(res.body.revoked).toBeGreaterThanOrEqual(2);

    expect((await as(a.token).get('/api/v1/platform/me')).status).toBe(200);
    expect((await as(b.token).get('/api/v1/platform/me')).status).toBe(401);
    expect((await as(c.token).get('/api/v1/platform/me')).status).toBe(401);
    const list = await as(a.token).get('/api/v1/platform/sessions');
    expect(list.body).toHaveLength(1);
    expect(list.body[0].current).toBe(true);
  });

  it('logging out ends the session for its access token too', async () => {
    const a = await login();
    const out = await request(app.getHttpServer())
      .post('/api/v1/platform-auth/logout')
      .set('Authorization', `Bearer ${a.token}`)
      .set('Cookie', `jamanvaar_platform_refresh=${a.refreshCookie}`);
    expect(out.status).toBe(200);
    expect((await as(a.token).get('/api/v1/platform/me')).status).toBe(401);
  });

  it("cannot revoke someone else's session", async () => {
    const mine = await login();
    const theirs = await login(otherEmail);
    const theirId = (await as(theirs.token).get('/api/v1/platform/sessions')).body.find((s: any) => s.current).id;
    const res = await as(mine.token).delete(`/api/v1/platform/sessions/${theirId}`);
    expect(res.status).toBe(404);
    expect((await as(theirs.token).get('/api/v1/platform/me')).status).toBe(200);
  });

  it('changing the password keeps the current session and ends the others', async () => {
    const a = await login();
    const b = await login();
    const res = await request(app.getHttpServer())
      .patch('/api/v1/platform/me/password')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ currentPassword: password, newPassword: 'a-brand-new-password-123' });
    expect(res.status).toBe(200);
    expect((await as(a.token).get('/api/v1/platform/me')).status).toBe(200);
    expect((await as(b.token).get('/api/v1/platform/me')).status).toBe(401);
  });

  describe('location, session cap and lifetime (BUG-094)', () => {
    const capEmail = `test-sessions-cap-${Date.now()}@example.com`;
    const supportEmail = `test-sessions-support-${Date.now()}@example.com`;
    const ownerEmail = `test-sessions-owner-${Date.now()}@example.com`;

    beforeAll(async () => {
      await createTestPlatformUser(prisma, { email: capEmail, password });
      await createTestPlatformUser(prisma, { email: ownerEmail, password });
      await createTestPlatformUser(prisma, { email: supportEmail, password, role: 'SUPPORT_ADMIN' });
    });
    afterAll(async () => {
      await prisma.platformUser.deleteMany({ where: { email: { in: [capEmail, supportEmail, ownerEmail] } } });
    });

    it('shows an approximate location from the proxy headers, or "Local network" for a private address', async () => {
      const withHeaders = await login(ownerEmail, undefined, { 'CF-IPCity': 'Ahmedabad', 'CF-IPCountry': 'IN' });
      const list = await as(withHeaders.token).get('/api/v1/platform/sessions');
      expect(list.body.find((s: any) => s.current).location).toBe('Ahmedabad, IN');

      const plain = await login(ownerEmail);
      const plainList = await as(plain.token).get('/api/v1/platform/sessions');
      expect(plainList.body.find((s: any) => s.current).location).toBe('Local network');
    });

    it('caps how many sessions one account can hold: signing in on a sixth device ends the oldest', async () => {
      const tokens: string[] = [];
      for (let i = 0; i < 6; i += 1) tokens.push((await login(capEmail)).token);

      const list = await as(tokens[5]).get('/api/v1/platform/sessions');
      expect(list.body).toHaveLength(5);

      const oldest = await as(tokens[0]).get('/api/v1/platform/me');
      expect(oldest.status).toBe(401);
      expect(oldest.body.code).toBe('SESSION_REVOKED');
      expect((await as(tokens[1]).get('/api/v1/platform/me')).status).toBe(200);
    });

    it('privileged roles get a shorter sign-in lifetime than everyone else', async () => {
      await login(ownerEmail);
      await login(supportEmail);
      const rows = await prisma.platformRefreshToken.findMany({ where: { platformUser: { email: { in: [ownerEmail, supportEmail] } } }, include: { platformUser: { select: { email: true } } }, orderBy: { createdAt: 'desc' } });
      const days = (e: string) => {
        const row = rows.find((r) => r.platformUser.email === e)!;
        return Math.round((row.expiresAt.getTime() - Date.now()) / 86_400_000);
      };
      expect(days(ownerEmail)).toBe(7);
      expect(days(supportEmail)).toBe(30);
    });
  });
});
