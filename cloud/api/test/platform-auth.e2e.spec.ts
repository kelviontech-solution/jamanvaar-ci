import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, extractCookie } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Platform authentication + authorization (Phase 1a)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `test-auth-${Date.now()}@example.com`;
  const password = 'correct-horse-battery-staple';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
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

  it('logs in with correct credentials, receives an access token, and can reach a protected route', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/platform-auth/login')
      .send({ email, password });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.accessToken).toBeTypeOf('string');
    expect(loginRes.body.user.email).toBe(email);
    // The password hash must never appear in any response.
    expect(JSON.stringify(loginRes.body)).not.toContain('passwordHash');

    const refreshCookie = extractCookie(loginRes.headers['set-cookie'], 'jamanvaar_platform_refresh');
    expect(refreshCookie).toBeDefined();

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/platform/me')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.email).toBe(email);
    expect(meRes.body).not.toHaveProperty('passwordHash');
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
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/platform-auth/login')
      .send({ email, password });
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
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/platform-auth/login')
      .send({ email, password });
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

  it('creates an audit record for login and logout', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/platform-auth/login')
      .send({ email, password });

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
