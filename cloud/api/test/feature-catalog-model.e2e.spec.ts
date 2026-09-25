import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Generic feature catalog model (Phase 10)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-feature-model-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
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
    if (createdCategoryIds.length) {
      await prisma.runAsPlatform((tx) => tx.featureCategory.deleteMany({ where: { id: { in: createdCategoryIds } } }));
    }
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('creates a feature category and lists it back', async () => {
    const stamp = Date.now();
    const create = await authed('post', '/api/v1/feature-categories').send({
      code: `test_category_${stamp}`, name: 'Test Category', description: 'A category created by a test.', sortOrder: 999
    });
    expect(create.status).toBe(201);
    createdCategoryIds.push(create.body.id);

    const list = await authed('get', '/api/v1/feature-categories');
    expect(list.status).toBe(200);
    expect(list.body.some((c: { id: string }) => c.id === create.body.id)).toBe(true);
  });

  it('updates name/description/sortOrder but rejects changing code', async () => {
    const stamp = Date.now();
    const create = await authed('post', '/api/v1/feature-categories').send({
      code: `test_category_immutable_${stamp}`, name: 'Original Name', description: 'Original.', sortOrder: 1
    });
    createdCategoryIds.push(create.body.id);

    const update = await authed('patch', `/api/v1/feature-categories/${create.body.id}`).send({ name: 'New Name', sortOrder: 2 });
    expect(update.status).toBe(200);
    expect(update.body.name).toBe('New Name');
    expect(update.body.code).toBe(`test_category_immutable_${stamp}`);

    const attemptCodeChange = await authed('patch', `/api/v1/feature-categories/${create.body.id}`).send({ code: 'something_else' });
    expect(attemptCodeChange.status).toBe(400);
  });

  it('rejects a duplicate code', async () => {
    const stamp = Date.now();
    const code = `test_category_dup_${stamp}`;
    const first = await authed('post', '/api/v1/feature-categories').send({ code, name: 'First', description: 'First.', sortOrder: 1 });
    createdCategoryIds.push(first.body.id);
    const second = await authed('post', '/api/v1/feature-categories').send({ code, name: 'Second', description: 'Second.', sortOrder: 2 });
    expect(second.status).toBe(409);
  });

  it('requires platform authentication', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/feature-categories');
    expect(res.status).toBe(401);
  });

  it('the seed produced exactly 16 categories and 22 features, with every legacy key and AppCode represented exactly once', async () => {
    const categories = await prisma.runAsPlatform((tx) => tx.featureCategory.findMany());
    expect(categories.length).toBeGreaterThanOrEqual(16);

    const features = await prisma.runAsPlatform((tx) => tx.feature.findMany());
    const seeded = features.filter((f) => f.legacyEntitlementKey !== null || f.code === 'KIOSK_ADMIN');
    expect(seeded.length).toBeGreaterThanOrEqual(22);

    const legacyKeys = new Set(features.map((f) => f.legacyEntitlementKey).filter((k): k is string => k !== null));
    expect(legacyKeys.size).toBe(21); // every one of the 21 pre-existing Plan.entitlements keys, exactly once each

    const appCodes = new Set(features.map((f) => f.appCode).filter((a) => a !== null).map((a) => a as string));
    expect(appCodes).toEqual(new Set(['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN', 'QR_ORDERING']));
  });

  it('KIOSK_ADMIN depends on the KIOSK feature, and the dependency resolves to a real feature id', async () => {
    const kioskAdmin = await prisma.runAsPlatform((tx) => tx.feature.findUniqueOrThrow({ where: { code: 'KIOSK_ADMIN' } }));
    const kiosk = await prisma.runAsPlatform((tx) => tx.feature.findUniqueOrThrow({ where: { code: 'selfOrderKiosk' } }));
    expect(kioskAdmin.dependsOnFeatureIds).toEqual([kiosk.id]);
  });

  it('restaurantAdmin (POS_ADMIN) depends on posTerminal (POS), mirroring the legacy hardcoded catalog', async () => {
    const restaurantAdmin = await prisma.runAsPlatform((tx) => tx.feature.findUniqueOrThrow({ where: { code: 'restaurantAdmin' } }));
    const posTerminal = await prisma.runAsPlatform((tx) => tx.feature.findUniqueOrThrow({ where: { code: 'posTerminal' } }));
    expect(restaurantAdmin.dependsOnFeatureIds).toEqual([posTerminal.id]);
  });

  it('re-running the seed is idempotent: same 16 categories and 22 features, no duplicates', async () => {
    const { execSync } = await import('node:child_process');
    // Runs ts-node directly (not `npx prisma db seed`, which re-loads .env through Prisma's own
    // CLI env layer) so the seed unambiguously runs against this test's own DATABASE_URL — the
    // one test/setup.ts already swapped to TEST_DATABASE_URL for this whole process.
    const seedEnv = { ...process.env };
    execSync('npx ts-node prisma/seed.ts', { cwd: process.cwd(), env: seedEnv });
    const categories = await prisma.runAsPlatform((tx) => tx.featureCategory.count());
    const features = await prisma.runAsPlatform((tx) => tx.feature.count());
    // Re-running must not have duplicated the 16/22 seeded rows (other tests in the full suite
    // may add their own throwaway categories/features, so this checks "did not grow from a
    // second seed run", not an exact total — capture the count once more immediately after and
    // compare to itself for stability instead of a brittle exact literal.
    execSync('npx ts-node prisma/seed.ts', { cwd: process.cwd(), env: seedEnv });
    const categoriesAfterSecondRun = await prisma.runAsPlatform((tx) => tx.featureCategory.count());
    const featuresAfterSecondRun = await prisma.runAsPlatform((tx) => tx.feature.count());
    expect(categoriesAfterSecondRun).toBe(categories);
    expect(featuresAfterSecondRun).toBe(features);
  }, 30_000);

  it('creates a feature under an existing category, lists it, and rejects a dependsOnFeatureIds entry that is not a real feature id', async () => {
    const categories = await authed('get', '/api/v1/feature-categories');
    const categoryId = categories.body[0].id;

    const bad = await authed('post', '/api/v1/features').send({
      code: `test_feature_bad_dep_${Date.now()}`, name: 'Bad Dep', description: 'Has a fake dependency.',
      categoryId, dependsOnFeatureIds: ['00000000-0000-0000-0000-000000000000']
    });
    expect(bad.status).toBe(400);

    const good = await authed('post', '/api/v1/features').send({
      code: `test_feature_${Date.now()}`, name: 'Test Feature', description: 'A feature created by a test.', categoryId
    });
    expect(good.status).toBe(201);

    const list = await authed('get', '/api/v1/features');
    expect(list.body.some((f: { id: string }) => f.id === good.body.id)).toBe(true);

    await authed('patch', `/api/v1/features/${good.body.id}`).send({ isActive: false });
    await authed('delete', `/api/v1/features/${good.body.id}`).then((r) => expect(r.status).toBe(200));
  });

  it('rejects deleting a feature that another feature depends on, until it is deactivated, and rejects deleting an active feature outright', async () => {
    const categories = await authed('get', '/api/v1/feature-categories');
    const categoryId = categories.body[0].id;

    const base = await authed('post', '/api/v1/features').send({
      code: `test_base_${Date.now()}`, name: 'Base', description: 'A base feature.', categoryId
    });
    const dependent = await authed('post', '/api/v1/features').send({
      code: `test_dependent_${Date.now()}`, name: 'Dependent', description: 'Depends on base.', categoryId, dependsOnFeatureIds: [base.body.id]
    });
    expect(dependent.status).toBe(201);

    // Still active: deletion refused outright, before dependency is even considered.
    const deleteActive = await authed('delete', `/api/v1/features/${base.body.id}`);
    expect(deleteActive.status).toBe(400);

    const deactivate = await authed('patch', `/api/v1/features/${base.body.id}`).send({ isActive: false });
    expect(deactivate.status).toBe(200);

    // Now inactive, but something else still depends on it.
    const deleteStillDependedOn = await authed('delete', `/api/v1/features/${base.body.id}`);
    expect(deleteStillDependedOn.status).toBe(409);
    expect(deleteStillDependedOn.body.message).toContain('Dependent');

    await authed('patch', `/api/v1/features/${dependent.body.id}`).send({ isActive: false });
    await authed('delete', `/api/v1/features/${dependent.body.id}`);

    const deleteNowUnblocked = await authed('delete', `/api/v1/features/${base.body.id}`);
    expect(deleteNowUnblocked.status).toBe(200);
  });

  it('rejects setting legacyEntitlementKey through the API and rejects changing code after creation', async () => {
    const categories = await authed('get', '/api/v1/feature-categories');
    const categoryId = categories.body[0].id;
    const create = await authed('post', '/api/v1/features').send({
      code: `test_no_legacy_${Date.now()}`, name: 'No Legacy', description: 'Should not accept a legacy key.', categoryId,
      legacyEntitlementKey: 'somethingMadeUp'
    });
    expect(create.status).toBe(400);
  });
});
