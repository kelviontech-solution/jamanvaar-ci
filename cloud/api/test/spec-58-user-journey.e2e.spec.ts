import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailService } from '../src/modules/notifications/email.service';

/**
 * Spec section 58's full onboarding-to-daily-use journey, chained end to end: Super Admin
 * creates a restaurant, assigns a RESTAURANT plan, separately assigns a KIOSK add-on, a Kiosk
 * terminal activates with the restaurantCode + a key, the owner logs into Kiosk Admin with just
 * restaurantCode + password, does a forgot-password round trip, and Super Admin's own read of
 * the restaurant reflects all of it. Every step here already has its own dedicated test
 * elsewhere (Phases 1-8) — this test's only job is the combination working together.
 */
describe('Spec section 58: full commercial onboarding journey (Phase 9)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-journey-admin-${stamp}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  const ownerEmail = `journey-owner-${stamp}@example.com`;
  const ownerPassword = 'the-owners-first-password-1';
  let platformToken: string;
  let restaurantId: string;
  let restaurantCode: string;
  const sent: Array<{ to: string; subject: string; html: string }> = [];
  const lastCode = () => /(\d{6})<\/span>/.exec(sent[sent.length - 1].html)![1];

  const platform = (method: 'get' | 'post', url: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${platformToken}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    platformToken = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;
    vi.spyOn(app.get(EmailService), 'send').mockImplementation(async (to, subject, html) => {
      sent.push({ to, subject, html });
      return true;
    });
  });

  afterAll(async () => {
    if (restaurantId) await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('walks the whole journey: onboard, dual-subscribe, activate a Kiosk, owner logs in, resets a forgotten password, and Super Admin sees it all', async () => {
    // 1. Super Admin creates the restaurant — restaurantCode is generated from the mobile number.
    const create = await platform('post', '/api/v1/restaurants').send({
      name: `TEST Journey Restaurant ${stamp}`, mobile: `9${String(stamp).slice(-9)}`, ownerName: 'Journey Owner', ownerEmail
    });
    expect(create.status).toBe(201);
    restaurantId = create.body.restaurant.id;
    restaurantCode = create.body.restaurant.restaurantCode;
    expect(restaurantCode).toMatch(/^JM[6-9][0-9]{9}$/);
    const activationToken = create.body.activationToken as string;

    await request(app.getHttpServer()).post('/api/v1/tenant-auth/set-initial-password').send({
      restaurantId, email: ownerEmail, activationToken, newPassword: ownerPassword
    });

    // 2. A RESTAURANT-family Pro plan, assigned first.
    const restaurantPlan = await platform('post', '/api/v1/plans').send({
      tier: 'PRO', name: `TEST Journey RESTAURANT Plan ${stamp}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: {}
    });
    const restaurantSub = await platform('post', '/api/v1/subscriptions').send({
      restaurantId, planId: restaurantPlan.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 365 * 86400000).toISOString()
    });
    expect(restaurantSub.status).toBe(201);

    // 3. A KIOSK-family add-on, purchased/assigned separately, concurrent with the plan above.
    const kioskPlan = await platform('post', '/api/v1/plans').send({
      tier: 'CORE', productFamily: 'KIOSK', name: `TEST Journey KIOSK Plan ${stamp}`, priceMonthly: 90000, maxBranches: 3, maxDevices: 5, maxUsers: 20, entitlements: {}
    });
    const kioskSub = await platform('post', '/api/v1/subscriptions').send({
      restaurantId, planId: kioskPlan.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 365 * 86400000).toISOString()
    });
    expect(kioskSub.status).toBe(201);

    // 4. A Kiosk terminal activates: the installer resolves restaurantCode -> restaurantId first
    // (exactly what kiosk-user's Phase 8 flow does), then redeems a real activation key.
    const lookup = await request(app.getHttpServer()).post('/api/v1/restaurant-lookup/resolve').send({ restaurantCode });
    expect(lookup.status).toBe(200);
    expect(lookup.body.restaurantId).toBe(restaurantId);

    const key = await platform('post', '/api/v1/activation-keys').send({
      restaurantId, allowedDeviceType: 'KIOSK', expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    const redeem = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: 'KIOSK' });
    expect(redeem.status).toBe(201);
    expect(redeem.body.restaurantId).toBe(restaurantId);

    // 5. Kiosk Admin: the owner logs in with just restaurantCode + password, no email.
    const login = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantCode, password: ownerPassword });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('OWNER');

    // 6. Forgot-password round trip, then the new password works and the old one doesn't.
    const forgot = await request(app.getHttpServer()).post('/api/v1/tenant-auth/forgot-password-owner').send({ restaurantCode });
    expect(forgot.status).toBe(200);
    const otp = lastCode();
    const newPassword = 'the-owners-reset-password-2';
    const reset = await request(app.getHttpServer()).post('/api/v1/tenant-auth/reset-password-owner').send({ restaurantCode, otp, newPassword });
    expect(reset.status).toBe(200);

    const loginWithNew = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantCode, password: newPassword });
    expect(loginWithNew.status).toBe(200);
    const loginWithOld = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantCode, password: ownerPassword });
    expect(loginWithOld.status).toBe(401);

    // 7. Super Admin's own read of the restaurant shows everything in sync: the code, both
    // active subscriptions (each granting only its own family's apps), and the redeemed device.
    const detail = await platform('get', `/api/v1/restaurants/${restaurantId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.restaurantCode).toBe(restaurantCode);
    expect(detail.body.subscriptions.filter((s: { status: string }) => s.status === 'ACTIVE')).toHaveLength(2);

    const restaurantSubApps = await platform('get', `/api/v1/subscriptions/${restaurantSub.body.id}/applications`);
    const restaurantEnabled = restaurantSubApps.body.filter((r: { enabled: boolean }) => r.enabled).map((r: { appCode: string }) => r.appCode);
    expect(restaurantEnabled).not.toContain('KIOSK');
    expect(restaurantEnabled).not.toContain('KIOSK_ADMIN');

    const kioskSubApps = await platform('get', `/api/v1/subscriptions/${kioskSub.body.id}/applications`);
    const kioskEnabled = kioskSubApps.body.filter((r: { enabled: boolean }) => r.enabled).map((r: { appCode: string }) => r.appCode);
    expect(kioskEnabled).toContain('KIOSK');
    expect(kioskEnabled).not.toContain('POS');
    expect(kioskEnabled).not.toContain('CAPTAIN');

    expect(detail.body.devices.some((d: { type: string; status: string }) => d.type === 'KIOSK' && d.status === 'ACTIVE')).toBe(true);
  });
});
