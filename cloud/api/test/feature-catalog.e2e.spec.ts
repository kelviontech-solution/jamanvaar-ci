import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { ALL_APP_CODES } from '../src/modules/application-entitlements/application-entitlements.service';

describe('Feature catalog (Phase 6)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-feature-catalog-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let subscriptionId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    platformToken = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;

    const restaurantRes = await request(app.getHttpServer())
      .post('/api/v1/restaurants')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: `TEST Feature Catalog ${Date.now()}`, ownerName: 'Catalog Owner', ownerEmail: `catalog-owner-${Date.now()}@test.example.com` });
    restaurantId = restaurantRes.body.restaurant.id;

    const planRes = await request(app.getHttpServer())
      .post('/api/v1/plans')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ tier: 'PRO', name: `TEST Feature Catalog Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: {} });

    const subRes = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ restaurantId, planId: planRes.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });
    subscriptionId = subRes.body.id;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('returns a catalog entry for every AppCode, each with a real category, a description and a valid dependsOn list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/application-entitlements/catalog')
      .set('Authorization', `Bearer ${platformToken}`);
    expect(res.status).toBe(200);

    const returnedCodes = Object.keys(res.body).sort();
    expect(returnedCodes).toEqual([...ALL_APP_CODES].sort());

    for (const appCode of ALL_APP_CODES) {
      const entry = res.body[appCode];
      expect(typeof entry.category).toBe('string');
      expect(entry.category.length).toBeGreaterThan(0);
      expect(typeof entry.description).toBe('string');
      expect(entry.description.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.dependsOn)).toBe(true);
      for (const dep of entry.dependsOn) {
        expect(ALL_APP_CODES).toContain(dep);
      }
    }
  });

  it('POS_ADMIN depends on POS and KIOSK_ADMIN depends on KIOSK; the base terminal apps have no dependencies', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/application-entitlements/catalog')
      .set('Authorization', `Bearer ${platformToken}`);
    expect(res.body.POS_ADMIN.dependsOn).toEqual(['POS']);
    expect(res.body.KIOSK_ADMIN.dependsOn).toEqual(['KIOSK']);
    expect(res.body.POS.dependsOn).toEqual([]);
    expect(res.body.KIOSK.dependsOn).toEqual([]);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/application-entitlements/catalog');
    expect(res.status).toBe(401);
  });

  it('refuses to disable POS while POS_ADMIN (a dependent) is still enabled, naming it in the error', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/subscriptions/${subscriptionId}/applications/POS`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ enabled: false });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('POS_ADMIN');
  });

  it('allows disabling POS_ADMIN itself at any time, regardless of POS', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/subscriptions/${subscriptionId}/applications/POS_ADMIN`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ enabled: false });
    expect(res.status).toBe(200);
  });

  it('once its dependent (POS_ADMIN) is disabled, POS itself can now be disabled', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/subscriptions/${subscriptionId}/applications/POS`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ enabled: false });
    expect(res.status).toBe(200);
  });

  it('re-enabling POS_ADMIN succeeds unconditionally even while its prerequisite POS is disabled — the graph only blocks disable, never enable', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/subscriptions/${subscriptionId}/applications/POS_ADMIN`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ enabled: true });
    expect(res.status).toBe(200);
  });

  it('disabling an app with no dependents (KDS) never requires anything else to change first', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/subscriptions/${subscriptionId}/applications/KDS`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ enabled: false });
    expect(res.status).toBe(200);
  });
});
