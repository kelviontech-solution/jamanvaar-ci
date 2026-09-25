import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Plan.entitlements keys are DB-driven (Phase 11)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-dynamic-ent-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  const createdPlanIds: string[] = [];
  const createdFeatureIds: string[] = [];
  const createdCategoryIds: string[] = [];

  const authed = (method: 'get' | 'post' | 'patch' | 'delete', url: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${platformToken}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    platformToken = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;
  });

  afterAll(async () => {
    if (createdPlanIds.length) {
      await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: { in: createdPlanIds } } }));
    }
    if (createdFeatureIds.length) {
      await prisma.runAsPlatform((tx) => tx.feature.deleteMany({ where: { id: { in: createdFeatureIds } } }));
    }
    if (createdCategoryIds.length) {
      await prisma.runAsPlatform((tx) => tx.featureCategory.deleteMany({ where: { id: { in: createdCategoryIds } } }));
    }
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('rejects a Plan.entitlements key that matches no live Feature.legacyEntitlementKey', async () => {
    const res = await authed('post', '/api/v1/plans').send({
      tier: 'CORE', name: `TEST plan bad key ${Date.now()}`, priceMonthly: 500000,
      maxBranches: 1, maxDevices: 5, maxUsers: 10,
      entitlements: { totallyMadeUpKey: true }
    });
    if (res.status === 201) createdPlanIds.push(res.body.id);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('totallyMadeUpKey');
  });

  it('a brand-new Feature.legacyEntitlementKey becomes valid immediately, no deploy needed', async () => {
    const catRes = await authed('post', '/api/v1/feature-categories').send({
      code: `test_dyn_cat_${Date.now()}`, name: 'Test Dynamic Category', description: 'For dynamic key test.', sortOrder: 999
    });
    createdCategoryIds.push(catRes.body.id);

    const newKey = `dynamicTestKey${Date.now()}`;
    const feature = await prisma.runAsPlatform((tx) =>
      tx.feature.create({
        data: {
          code: newKey, name: 'Dynamic Test Feature', description: 'Proves DB-driven validation.',
          categoryId: catRes.body.id, legacyEntitlementKey: newKey
        }
      })
    );
    createdFeatureIds.push(feature.id);

    const res = await authed('post', '/api/v1/plans').send({
      tier: 'CORE', name: `TEST plan new key ${Date.now()}`, priceMonthly: 500000,
      maxBranches: 1, maxDevices: 5, maxUsers: 10,
      entitlements: { [newKey]: true }
    });
    expect(res.status).toBe(201);
    createdPlanIds.push(res.body.id);
    expect(res.body.entitlements[newKey]).toBe(true);
    expect(res.body.entitlements.posTerminal).toBe(false);
  });

  it('update() applies the same live validation', async () => {
    const createRes = await authed('post', '/api/v1/plans').send({
      tier: 'CORE', name: `TEST plan for update ${Date.now()}`, priceMonthly: 500000,
      maxBranches: 1, maxDevices: 5, maxUsers: 10, entitlements: { posTerminal: true }
    });
    createdPlanIds.push(createRes.body.id);

    const badUpdate = await authed('patch', `/api/v1/plans/${createRes.body.id}`).send({
      entitlements: { notARealKeyEither: true }
    });
    expect(badUpdate.status).toBe(400);
  });
});

describe('Plan responses carry computed defaultApps (Phase 11)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-default-apps-admin-${Date.now()}@example.com`;
  let token: string;
  const planIds: string[] = [];
  const api = (method: 'get' | 'post', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    token = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: { in: planIds } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('matches productFamily/tier on create, get and list', async () => {
    const core = await api('post', '/api/v1/plans').send({
      tier: 'CORE', productFamily: 'RESTAURANT', name: `TEST defaultApps core ${Date.now()}`,
      priceMonthly: 500000, maxBranches: 1, maxDevices: 5, maxUsers: 10, entitlements: {}
    });
    planIds.push(core.body.id);
    expect([...core.body.defaultApps].sort()).toEqual(['POS', 'POS_ADMIN']);

    const kiosk = await api('post', '/api/v1/plans').send({
      tier: 'PRO', productFamily: 'KIOSK', name: `TEST defaultApps kiosk ${Date.now()}`,
      priceMonthly: 900000, maxBranches: 1, maxDevices: 5, maxUsers: 10, entitlements: {}
    });
    planIds.push(kiosk.body.id);
    expect([...kiosk.body.defaultApps].sort()).toEqual(['KIOSK', 'KIOSK_ADMIN']);

    const detail = await api('get', `/api/v1/plans/${kiosk.body.id}`);
    expect(detail.body.defaultApps).toEqual(kiosk.body.defaultApps);
    const list = await api('get', '/api/v1/plans');
    expect(list.body.every((p: { defaultApps: unknown }) => Array.isArray(p.defaultApps))).toBe(true);
  });
});
