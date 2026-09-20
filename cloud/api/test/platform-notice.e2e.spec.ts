import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * BUG-091 / BUG-092: "Maintenance mode" was only a saved flag - nothing told any
 * restaurant app. The notice now travels in the terminals' heartbeat answer and on
 * a Restaurant Admin endpoint, honours an optional start/end time, and every
 * platform setting is validated before it is stored.
 */
describe('Platform notice / maintenance mode (BUG-091/092)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-notice-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  const ownerEmail = `notice-owner-${Date.now()}@test.example.com`;
  const ownerPassword = 'owner-password-long-enough';
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  let posToken: string;
  let tenantToken: string;
  let originalMaintenance: unknown;

  const platform = (method: 'get' | 'post' | 'patch', url: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${platformToken}`);
  const setMaintenance = (value: unknown) => platform('patch', '/api/v1/platform/settings/platform.maintenance').send({ value });
  const heartbeat = () =>
    request(app.getHttpServer()).patch('/api/v1/devices/me/heartbeat').set('Authorization', `Bearer ${posToken}`).send({ syncStatus: 'ok', appVersion: '1.0.0' });
  const tenantNotice = () => request(app.getHttpServer()).get('/api/v1/tenant/platform-notice').set('Authorization', `Bearer ${tenantToken}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const existing = await prisma.runAsPlatform((tx) => tx.platformSetting.findUnique({ where: { key: 'platform.maintenance' } }));
    originalMaintenance = existing?.value ?? { maintenanceMode: false, statusBanner: '' };
    await prisma.runAsPlatform((tx) =>
      tx.platformSetting.upsert({
        where: { key: 'platform.maintenance' },
        update: {},
        create: { key: 'platform.maintenance', category: 'SYSTEM', description: 'Global maintenance mode and operational status banner', value: originalMaintenance as object }
      })
    );

    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    const login = await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email: adminEmail, password: adminPassword });
    platformToken = login.body.accessToken;

    const rest = await platform('post', '/api/v1/restaurants').send({ name: `TEST Notice ${Date.now()}`, ownerName: 'Notice Owner', ownerEmail });
    restaurantId = rest.body.restaurant.id;
    await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/set-initial-password')
      .send({ restaurantId, email: ownerEmail, activationToken: rest.body.activationToken, newPassword: ownerPassword });
    const plan = await platform('post', '/api/v1/plans').send({
      tier: 'PRO', name: `TEST Notice Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { pos: true }
    });
    planId = plan.body.id;
    await platform('post', '/api/v1/subscriptions').send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });

    const key = await platform('post', '/api/v1/activation-keys').send({ restaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const redeem = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: 'POS' });
    posToken = redeem.body.deviceToken;

    const session = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login').send({ email: ownerEmail, password: ownerPassword, restaurantId });
    tenantToken = session.body.accessToken;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.platformSetting.update({ where: { key: 'platform.maintenance' }, data: { value: originalMaintenance as object } }));
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('no notice while maintenance mode is off', async () => {
    expect((await setMaintenance({ maintenanceMode: false, statusBanner: 'ignored' })).status).toBe(200);
    expect((await heartbeat()).body.notice).toBeNull();
    const t = await tenantNotice();
    expect(t.status).toBe(200);
    expect(t.body.notice).toBeNull();
  });

  it('turning it on reaches a terminal (heartbeat) and a Restaurant Admin session', async () => {
    expect((await setMaintenance({ maintenanceMode: true, statusBanner: 'Planned upgrade tonight 2-3am' })).status).toBe(200);

    const hb = await heartbeat();
    expect(hb.status).toBe(200);
    expect(hb.body.notice).toMatchObject({ message: 'Planned upgrade tonight 2-3am' });

    const t = await tenantNotice();
    expect(t.body.notice).toMatchObject({ message: 'Planned upgrade tonight 2-3am' });
  });

  it('a notice with no message still says something useful instead of an empty banner', async () => {
    await setMaintenance({ maintenanceMode: true, statusBanner: '' });
    const hb = await heartbeat();
    expect(hb.body.notice.message).toMatch(/maintenance/i);
  });

  it('honours an optional start and end time', async () => {
    const past = new Date(Date.now() - 2 * 3600000).toISOString();
    const soon = new Date(Date.now() + 3600000).toISOString();
    const later = new Date(Date.now() + 3 * 3600000).toISOString();

    await setMaintenance({ maintenanceMode: true, statusBanner: 'Window in the past', startsAt: past, endsAt: new Date(Date.now() - 3600000).toISOString() });
    expect((await heartbeat()).body.notice).toBeNull();

    await setMaintenance({ maintenanceMode: true, statusBanner: 'Not started yet', startsAt: soon, endsAt: later });
    expect((await heartbeat()).body.notice).toBeNull();

    await setMaintenance({ maintenanceMode: true, statusBanner: 'Running now', startsAt: past, endsAt: later });
    const hb = await heartbeat();
    expect(hb.body.notice).toMatchObject({ message: 'Running now', endsAt: later });
  });

  it('the Restaurant Admin notice endpoint requires a sign-in', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/tenant/platform-notice');
    expect(res.status).toBe(401);
  });

  it('rejects an end time before the start, and over-long or wrongly-typed values', async () => {
    const bad = [
      { maintenanceMode: 'yes', statusBanner: 'x' },
      { maintenanceMode: true, statusBanner: 'x'.repeat(501) },
      { maintenanceMode: true, statusBanner: 'x', startsAt: 'not a date' },
      { maintenanceMode: true, statusBanner: 'x', startsAt: new Date(Date.now() + 7200000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString() },
      'just a string',
      null
    ];
    for (const value of bad) {
      const res = await setMaintenance(value);
      expect(res.status, JSON.stringify(value)).toBe(400);
    }
  });

  it('validates the other settings too (trial quotas, contact details)', async () => {
    const defaults = (value: unknown) => platform('patch', '/api/v1/platform/settings/platform.defaults').send({ value });
    expect((await defaults({ trialDurationDays: -5, maxTrialBranches: 1, maxTrialDevices: 5, defaultCurrency: 'INR' })).status).toBe(400);
    expect((await defaults({ trialDurationDays: 'many', maxTrialBranches: 1, maxTrialDevices: 5, defaultCurrency: 'INR' })).status).toBe(400);
    expect((await defaults({ trialDurationDays: 14, maxTrialBranches: 0, maxTrialDevices: 5, defaultCurrency: 'INR' })).status).toBe(400);

    const branding = (value: unknown) => platform('patch', '/api/v1/platform/settings/platform.branding').send({ value });
    expect((await branding({ platformName: '', companyName: 'Kelviontech', supportEmail: 'support@jamanvaar.app', supportPhone: '' })).status).toBe(400);
    expect((await branding({ platformName: 'JAMANVAAR', companyName: 'Kelviontech', supportEmail: 'not-an-email', supportPhone: '' })).status).toBe(400);
  });

  it('a setting with no defined shape cannot be written blindly', async () => {
    const res = await platform('patch', '/api/v1/platform/settings/some.unknown.key').send({ value: { a: 1 } });
    expect([400, 404]).toContain(res.status);
  });
});
