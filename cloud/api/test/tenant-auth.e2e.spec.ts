import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, extractCookie } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Tenant authentication + authorization', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-tenant-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;

  let restaurantId: string;
  let ownerActivationToken: string;
  const ownerEmail = `test-tenant-owner-${Date.now()}@example.com`;
  const ownerPassword = 'owner-correct-horse-battery';

  const authed = (method: 'get' | 'post' | 'patch', url: string, token: string) =>
    request(app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const platformLogin = await request(app.getHttpServer())
      .post('/api/v1/platform-auth/login')
      .send({ email: adminEmail, password: adminPassword });
    platformToken = platformLogin.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Tenant Auth Restaurant ${Date.now()}`,
      ownerName: 'Tenant Auth Test Owner',
      ownerEmail
    });
    restaurantId = restaurantRes.body.restaurant.id;
    ownerActivationToken = restaurantRes.body.activationToken;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('rejects an unauthenticated request to a protected tenant route', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/tenant/me');
    expect(res.status).toBe(401);
  });

  it('rejects login before the owner has ever set a password (passwordHash is still null)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: ownerEmail, password: 'anything' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('SEC-001: rejects initial password setup with a missing activation token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/set-initial-password')
      .send({ restaurantId, email: ownerEmail, newPassword: ownerPassword });
    expect(res.status).toBe(400); // fails DTO validation — token is required
  });

  it('SEC-001: rejects initial password setup with a wrong/guessed activation token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/set-initial-password')
      .send({ restaurantId, email: ownerEmail, activationToken: 'guessed-token-not-real', newPassword: ownerPassword });
    expect(res.status).toBe(401);
  });

  it('sets the initial password with the real activation token, then rejects doing so a second time', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/set-initial-password')
      .send({ restaurantId, email: ownerEmail, activationToken: ownerActivationToken, newPassword: ownerPassword });
    expect(first.status).toBe(200);

    const second = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/set-initial-password')
      .send({ restaurantId, email: ownerEmail, activationToken: ownerActivationToken, newPassword: 'something-else-entirely' });
    expect(second.status).toBe(409);
  });

  it('SEC-001: a consumed activation token can never be reused, even for a still-pending different flow', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/set-initial-password')
      .send({ restaurantId, email: ownerEmail, activationToken: ownerActivationToken, newPassword: 'yet-another-password' });
    expect(res.status).toBe(409); // already ACTIVE — token was cleared on first use
  });

  it('rejects login with the wrong password', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: ownerEmail, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('rejects login against a restaurantId the email does not belong to (same response as wrong password)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId: '00000000-0000-4000-8000-000000000000', email: ownerEmail, password: ownerPassword });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('logs in with correct credentials, receives an access token, and can reach a protected route', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: ownerEmail, password: ownerPassword });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.accessToken).toBeTypeOf('string');
    expect(loginRes.body.user.email).toBe(ownerEmail);
    expect(loginRes.body.user.role).toBe('OWNER');
    expect(JSON.stringify(loginRes.body)).not.toContain('passwordHash');

    const refreshCookie = extractCookie(loginRes.headers['set-cookie'], 'jamanvaar_tenant_refresh');
    expect(refreshCookie).toBeDefined();

    const meRes = await authed('get', '/api/v1/tenant/me', loginRes.body.accessToken);
    expect(meRes.status).toBe(200);
    expect(meRes.body.email).toBe(ownerEmail);
    expect(meRes.body.restaurantId).toBe(restaurantId);
    expect(meRes.body).not.toHaveProperty('passwordHash');
  });

  it('returnRefreshToken: true includes the refresh token directly in the response body', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: ownerEmail, password: ownerPassword, returnRefreshToken: true });

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeTypeOf('string');
    expect(res.body.refreshTokenExpiresAt).toBeTypeOf('string');
    // Still sets the cookie too — additive, not a replacement for browser callers.
    const refreshCookie = extractCookie(res.headers['set-cookie'], 'jamanvaar_tenant_refresh');
    expect(refreshCookie).toBeDefined();
  });

  it('without returnRefreshToken, the response body has no refreshToken field (regression guard)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: ownerEmail, password: ownerPassword });

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeUndefined();
  });

  it('adminOnly: true rejects a STAFF login with 403', async () => {
    const ownerLoginRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: ownerEmail, password: ownerPassword });
    const ownerToken = ownerLoginRes.body.accessToken;

    const staffEmail = `test-adminonly-staff-${Date.now()}@example.com`;
    const staffPassword = 'staff-correct-horse-battery';
    const createRes = await authed('post', '/api/v1/tenant/me/users', ownerToken).send({
      email: staffEmail,
      fullName: 'Front Desk Staff',
      role: 'STAFF',
      password: staffPassword
    });
    expect(createRes.status).toBe(201);

    const staffLoginRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: staffEmail, password: staffPassword, adminOnly: true });
    expect(staffLoginRes.status).toBe(403);

    // Cleanup — this test creates a real STAFF login on the shared test
    // restaurant; remove it so later tests (e.g. "lists just the owner
    // before any staff logins exist") aren't polluted by it.
    await prisma.runAsTenant(restaurantId, (tx) => tx.user.deleteMany({ where: { email: staffEmail } }));
  });

  it('adminOnly: true succeeds for OWNER and for MANAGER', async () => {
    const ownerRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: ownerEmail, password: ownerPassword, adminOnly: true });
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.user.role).toBe('OWNER');

    const ownerToken = ownerRes.body.accessToken;
    const managerEmail = `test-adminonly-manager-${Date.now()}@example.com`;
    const managerPassword = 'manager-correct-horse-battery';
    await authed('post', '/api/v1/tenant/me/users', ownerToken).send({
      email: managerEmail,
      fullName: 'Shift Manager',
      role: 'MANAGER',
      password: managerPassword
    });

    const managerRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: managerEmail, password: managerPassword, adminOnly: true });
    expect(managerRes.status).toBe(200);
    expect(managerRes.body.user.role).toBe('MANAGER');

    // Cleanup — see note in the previous test.
    await prisma.runAsTenant(restaurantId, (tx) => tx.user.deleteMany({ where: { email: managerEmail } }));
  });

  it('refresh accepts a body refreshToken when no cookie is present, and rotates it', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: ownerEmail, password: ownerPassword, returnRefreshToken: true });
    const originalRefreshToken = loginRes.body.refreshToken;

    // No cookie jar on this bare `request(...)` call — proves the body path works standalone.
    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/refresh')
      .send({ refreshToken: originalRefreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeTypeOf('string');
    expect(refreshRes.body.refreshToken).toBeTypeOf('string');
    expect(refreshRes.body.refreshToken).not.toBe(originalRefreshToken);
  });

  it('logout revokes a refresh token supplied via body (no cookie), confirmed by a subsequent refresh failing', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: ownerEmail, password: ownerPassword, returnRefreshToken: true });
    const accessToken = loginRes.body.accessToken;
    const refreshToken = loginRes.body.refreshToken;

    const logoutRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });
    expect(logoutRes.status).toBe(200);

    const refreshAfterLogout = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/refresh')
      .send({ refreshToken });
    expect(refreshAfterLogout.status).toBe(401);
  });

  it('rejects a garbage/invalid bearer token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/tenant/me')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('rejects a token signed for the platform issuer/audience, even with the correct secret', async () => {
    // Mirrors platform-auth.e2e.spec.ts's reverse case — proves TenantAuthGuard
    // enforces issuer/audience, not merely "is this a validly-signed JWT".
    const config = app.get(ConfigService);
    const jwt = app.get(JwtService);
    const forgedPlatformToken = jwt.sign(
      { sub: 'some-platform-user-id', email: 'admin@jamanvaar.app' },
      {
        secret: config.get<string>('JWT_ACCESS_SECRET'), // same secret on purpose
        issuer: 'jamanvaar-platform',
        audience: 'jamanvaar-platform',
        expiresIn: '15m'
      }
    );

    const res = await request(app.getHttpServer())
      .get('/api/v1/tenant/me')
      .set('Authorization', `Bearer ${forgedPlatformToken}`);

    expect(res.status).toBe(401);
  });

  it('rotates refresh tokens and rejects a refresh token replayed after rotation', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: ownerEmail, password: ownerPassword });
    const firstRefreshCookie = extractCookie(loginRes.headers['set-cookie'], 'jamanvaar_tenant_refresh')!;

    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/refresh')
      .set('Cookie', [`jamanvaar_tenant_refresh=${firstRefreshCookie}`]);
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeTypeOf('string');

    const replayRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/refresh')
      .set('Cookie', [`jamanvaar_tenant_refresh=${firstRefreshCookie}`]);
    expect(replayRes.status).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: ownerEmail, password: ownerPassword });
    const refreshCookie = extractCookie(loginRes.headers['set-cookie'], 'jamanvaar_tenant_refresh')!;

    const logoutRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/logout')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .set('Cookie', [`jamanvaar_tenant_refresh=${refreshCookie}`]);
    expect(logoutRes.status).toBe(200);

    const refreshAfterLogout = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/refresh')
      .set('Cookie', [`jamanvaar_tenant_refresh=${refreshCookie}`]);
    expect(refreshAfterLogout.status).toBe(401);
  });

  it('creates an audit record for login and logout', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: ownerEmail, password: ownerPassword });

    const user = await prisma.runAsPlatform((tx) => tx.user.findFirstOrThrow({ where: { restaurantId, email: ownerEmail } }));
    const loginAudit = await prisma.auditLog.findFirst({
      where: { actorType: 'TENANT', actorId: user.id, action: 'TENANT_LOGIN' },
      orderBy: { createdAt: 'desc' }
    });
    expect(loginAudit).toBeTruthy();
    expect(JSON.stringify(loginAudit)).not.toMatch(/password/i);

    const refreshCookie = extractCookie(loginRes.headers['set-cookie'], 'jamanvaar_tenant_refresh')!;
    await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/logout')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .set('Cookie', [`jamanvaar_tenant_refresh=${refreshCookie}`]);

    const logoutAudit = await prisma.auditLog.findFirst({
      where: { actorType: 'TENANT', actorId: user.id, action: 'TENANT_LOGOUT' },
      orderBy: { createdAt: 'desc' }
    });
    expect(logoutAudit).toBeTruthy();
  });

  describe('Entitlements', () => {
    let tenantToken: string;
    let planId: string;

    beforeAll(async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/tenant-auth/login')
        .send({ restaurantId, email: ownerEmail, password: ownerPassword });
      tenantToken = loginRes.body.accessToken;
    });

    afterAll(async () => {
      // Subscription (RLS-protected) must go first, or the Plan delete hits the
      // still-live Subscription_planId_fkey RESTRICT constraint.
      if (planId) {
        await prisma.runAsPlatform((tx) => tx.subscription.deleteMany({ where: { planId } }));
        await prisma.plan.deleteMany({ where: { id: planId } });
      }
    });

    it('returns a null shape when the restaurant has no active subscription yet', async () => {
      const res = await authed('get', '/api/v1/tenant/me/entitlements', tenantToken);
      expect(res.status).toBe(200);
      expect(res.body.subscriptionStatus).toBeNull();
      expect(res.body.entitlements).toBeNull();
    });

    it('returns the real plan entitlements once a subscription is assigned', async () => {
      const planRes = await authed('post', '/api/v1/plans', platformToken).send({
        tier: 'PRO',
        name: `TEST Tenant Entitlements Plan ${Date.now()}`,
        priceMonthly: 700000,
        maxBranches: 3,
        maxDevices: 10,
        maxUsers: 20,
        entitlements: { posTerminal: true, captainApp: true }
      });
      expect(planRes.status).toBe(201);
      planId = planRes.body.id;

      const subRes = await authed('post', '/api/v1/subscriptions', platformToken).send({
        restaurantId,
        planId,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      });
      expect(subRes.status).toBe(201);

      const res = await authed('get', '/api/v1/tenant/me/entitlements', tenantToken);
      expect(res.status).toBe(200);
      expect(res.body.subscriptionStatus).toBe('ACTIVE');
      expect(res.body.planTier).toBe('PRO');
      expect(res.body.entitlements.posTerminal).toBe(true);
      expect(res.body.entitlements.captainApp).toBe(true);
      expect(res.body.limits.maxBranches).toBe(3);
    });
  });

  describe('Self-service staff/device logins', () => {
    let ownerToken: string;
    const staffEmail = `test-tenant-staff-${Date.now()}@example.com`;
    const staffPassword = 'staff-correct-horse-battery';

    beforeAll(async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/tenant-auth/login')
        .send({ restaurantId, email: ownerEmail, password: ownerPassword });
      ownerToken = loginRes.body.accessToken;
    });

    it('lists just the owner before any staff logins exist', async () => {
      const res = await authed('get', '/api/v1/tenant/me/users', ownerToken);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].role).toBe('OWNER');
    });

    it('owner creates a staff/device login with an immediate password (no invite step)', async () => {
      const res = await authed('post', '/api/v1/tenant/me/users', ownerToken).send({
        email: staffEmail,
        fullName: 'Captain Tablet 1',
        role: 'STAFF',
        password: staffPassword
      });
      expect(res.status).toBe(201);
      expect(res.body.email).toBe(staffEmail);
      expect(res.body.status).toBe('ACTIVE');
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/tenant-auth/login')
        .send({ restaurantId, email: staffEmail, password: staffPassword });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.user.role).toBe('STAFF');
    });

    it('rejects a duplicate email within the same restaurant', async () => {
      const res = await authed('post', '/api/v1/tenant/me/users', ownerToken).send({
        email: staffEmail,
        fullName: 'Duplicate',
        role: 'STAFF',
        password: 'irrelevant-password'
      });
      expect(res.status).toBe(409);
    });

    it('a non-owner (STAFF) cannot create another login', async () => {
      const staffLoginRes = await request(app.getHttpServer())
        .post('/api/v1/tenant-auth/login')
        .send({ restaurantId, email: staffEmail, password: staffPassword });
      const staffToken = staffLoginRes.body.accessToken;

      const res = await authed('post', '/api/v1/tenant/me/users', staffToken).send({
        email: `should-not-be-created-${Date.now()}@example.com`,
        fullName: 'Nope',
        role: 'STAFF',
        password: 'irrelevant-password'
      });
      expect(res.status).toBe(403);
    });

    it('owner disables a staff login, which immediately blocks further login', async () => {
      const created = await authed('get', '/api/v1/tenant/me/users', ownerToken);
      const staffUser = created.body.find((u: { email: string }) => u.email === staffEmail);

      const disableRes = await authed('patch', `/api/v1/tenant/me/users/${staffUser.id}/status`, ownerToken).send({
        status: 'DISABLED'
      });
      expect(disableRes.status).toBe(200);
      expect(disableRes.body.status).toBe('DISABLED');

      const loginAfterDisable = await request(app.getHttpServer())
        .post('/api/v1/tenant-auth/login')
        .send({ restaurantId, email: staffEmail, password: staffPassword });
      expect(loginAfterDisable.status).toBe(401);
    });

    it('the owner cannot change their own status through this endpoint', async () => {
      const meRes = await authed('get', '/api/v1/tenant/me', ownerToken);
      const res = await authed('patch', `/api/v1/tenant/me/users/${meRes.body.id}/status`, ownerToken).send({
        status: 'DISABLED'
      });
      expect(res.status).toBe(400);
    });
  });
});
