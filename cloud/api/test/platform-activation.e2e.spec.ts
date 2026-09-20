import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
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
    ownerToken = (await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email: ownerEmail, password: ownerPassword })).body.accessToken;
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

  it('a weak new password is also refused when an existing teammate changes theirs', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/platform/me/password')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ currentPassword: ownerPassword, newPassword: 'short1' });
    expect(res.status).toBe(400);
  });
});
