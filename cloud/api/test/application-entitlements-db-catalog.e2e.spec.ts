import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Application-entitlements catalog is DB-backed (Phase 11)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-db-catalog-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let token: string;
  let restaurantId: string;
  let planId: string;
  let subscriptionId: string;

  const api = (method: 'get' | 'post' | 'patch' | 'delete', url: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    token = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;

    const rest = await api('post', '/api/v1/restaurants').send({
      name: `TEST DbCatalog ${Date.now()}`, ownerName: 'Owner', ownerEmail: `dbcatalog-${Date.now()}@test.example.com`
    });
    restaurantId = rest.body.restaurant.id;
    const plan = await api('post', '/api/v1/plans').send({
      tier: 'CORE', name: `TEST DbCatalog Plan ${Date.now()}`, priceMonthly: 100000,
      maxBranches: 1, maxDevices: 5, maxUsers: 10, entitlements: { posTerminal: true }
    });
    planId = plan.body.id;
    const sub = await api('post', '/api/v1/subscriptions').send({
      restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString()
    });
    subscriptionId = sub.body.id;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('GET /application-entitlements/catalog keeps its shape, sourced from the DB', async () => {
    const res = await api('get', '/api/v1/application-entitlements/catalog');
    expect(res.status).toBe(200);
    for (const code of ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN', 'QR_ORDERING']) {
      expect(typeof res.body[code].category).toBe('string');
      expect(typeof res.body[code].description).toBe('string');
      expect(Array.isArray(res.body[code].dependsOn)).toBe(true);
    }
    expect(res.body.POS_ADMIN.dependsOn).toEqual(['POS']);
    expect(res.body.KIOSK_ADMIN.dependsOn).toEqual(['KIOSK']);
  });

  it('the catalog reflects a live edit to a Feature (proves the DB is the source)', async () => {
    const original = await prisma.runAsPlatform((tx) => tx.feature.findUniqueOrThrow({ where: { code: 'captainApp' } }));
    try {
      await api('patch', `/api/v1/features/${original.id}`).send({ description: 'Edited live description.' });
      const res = await api('get', '/api/v1/application-entitlements/catalog');
      expect(res.body.CAPTAIN.description).toBe('Edited live description.');
    } finally {
      await api('patch', `/api/v1/features/${original.id}`).send({ description: original.description });
    }
  });

  it('still refuses disabling POS while POS_ADMIN is enabled', async () => {
    const res = await api('patch', `/api/v1/subscriptions/${subscriptionId}/applications/POS`).send({ enabled: false });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('POS_ADMIN');
  });
});
