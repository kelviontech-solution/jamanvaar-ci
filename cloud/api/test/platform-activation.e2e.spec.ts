import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * BUG-080/081: the invitation page never told an invitee their link was expired or already used
 * until after they typed a password, and the rules for that password were 8 characters of
 * anything. The page now asks the API about the link first.
 */
describe('Teammate invitation and activation (BUG-081)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const ownerEmail = `act-owner-${stamp}@example.com`;
  const ownerPassword = 'correct-horse-battery-staple';
  let ownerToken: string;
  const invitedEmails: string[] = [];

  const status = (email: string, token: string) =>
    request(app.getHttpServer()).get('/api/v1/platform-users/activation-status').query({ email, token });
  async function invite(label: string) {
    const email = `act-${label}-${stamp}@example.com`;
    invitedEmails.push(email);
    const res = await request(app.getHttpServer())
      .post('/api/v1/platform-users/invite')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email, fullName: `Invitee ${label}`, role: 'READ_ONLY' });
    return { email, token: res.body.activationToken as string, url: res.body.activationUrl as string, status: res.status };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: ownerEmail, password: ownerPassword });
    ownerToken = (await platformLogin(app, ownerEmail, ownerPassword)).body.accessToken;
  });

  afterAll(async () => {
    await prisma.platformUser.deleteMany({ where: { email: { in: [ownerEmail, ...invitedEmails] } } });
    await app.close();
  });

  it('the invitation link carries the token in the fragment, not the query string', async () => {
    const inv = await invite('link');
    expect(inv.status).toBe(201);
    expect(inv.url).toMatch(/\/activate#email=.+&token=.+/);
    expect(inv.url).not.toContain('?');
  });

  it('reports a valid invitation, with the invitee name, before any password is typed', async () => {
    const inv = await invite('valid');
    const res = await status(inv.email, inv.token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ state: 'VALID', fullName: 'Invitee valid' });
  });

  it('reports an invalid link, a wrong token and an unknown email the same way (no account probing)', async () => {
    const inv = await invite('wrong');
    expect((await status(inv.email, 'not-the-real-token-value')).body.state).toBe('INVALID');
    expect((await status(`nobody-${stamp}@example.com`, inv.token)).body.state).toBe('INVALID');
  });

  it('reports an expired invitation', async () => {
    const inv = await invite('expired');
    await prisma.platformUser.update({ where: { email: inv.email }, data: { activationTokenExpiresAt: new Date(Date.now() - 1000) } });
    expect((await status(inv.email, inv.token)).body.state).toBe('EXPIRED');
  });

  it('refuses a weak password with the reasons, and accepts a strong one; the link is then USED', async () => {
    const inv = await invite('pw');
    const weak = await request(app.getHttpServer())
      .post('/api/v1/platform-users/activate')
      .send({ email: inv.email, activationToken: inv.token, password: 'password1234' });
    expect(weak.status).toBe(400);
    expect(JSON.stringify(weak.body)).toMatch(/common/i);

    const ok = await request(app.getHttpServer())
      .post('/api/v1/platform-users/activate')
      .send({ email: inv.email, activationToken: inv.token, password: 'Tr1cky-horse-staple' });
    expect(ok.status).toBe(200);

    expect((await status(inv.email, inv.token)).body.state).toBe('USED');
  });

  /**
   * security-audit MED-03 (SAW-07/AUTH-02): resendInvite used to skip the
   * owner-target check every other mutation on a PLATFORM_OWNER row enforces —
   * a SUPER_ADMIN could regenerate the activation token for a still-pending
   * PLATFORM_OWNER invite and take the account over via the public /activate endpoint.
   */
  it('SUPER_ADMIN cannot resend an invite to a pending PLATFORM_OWNER, but can to a pending READ_ONLY', async () => {
    const superAdminEmail = `act-superadmin-${stamp}@example.com`;
    await createTestPlatformUser(prisma, { email: superAdminEmail, password: ownerPassword, role: 'SUPER_ADMIN' });
    const superAdminToken = (await platformLogin(app, superAdminEmail, ownerPassword)).body.accessToken;

    const pendingOwnerEmail = `act-pending-owner-${stamp}@example.com`;
    invitedEmails.push(pendingOwnerEmail, superAdminEmail);
    const inviteRes = await request(app.getHttpServer())
      .post('/api/v1/platform-users/invite')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: pendingOwnerEmail, fullName: 'Pending Owner', role: 'PLATFORM_OWNER' });
    expect(inviteRes.status, JSON.stringify(inviteRes.body)).toBe(201);
    const pendingOwnerId = inviteRes.body.user.id;

    const resendBySuperAdmin = await request(app.getHttpServer())
      .post(`/api/v1/platform-users/${pendingOwnerId}/resend-invite`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(resendBySuperAdmin.status).toBe(403);

    // A real PLATFORM_OWNER can still do it (functional regression check).
    const resendByOwner = await request(app.getHttpServer())
      .post(`/api/v1/platform-users/${pendingOwnerId}/resend-invite`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(resendByOwner.status).toBe(201);

    // SUPER_ADMIN can still resend an invite to a non-owner role.
    const inv = await invite('ro-for-superadmin');
    const roId = (await prisma.platformUser.findUniqueOrThrow({ where: { email: inv.email } })).id;
    const resendReadOnly = await request(app.getHttpServer())
      .post(`/api/v1/platform-users/${roId}/resend-invite`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(resendReadOnly.status).toBe(201);
  });

  it('a weak new password is also refused when an existing teammate changes theirs', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/platform/me/password')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ currentPassword: ownerPassword, newPassword: 'short1' });
    expect(res.status).toBe(400);
  });
});
