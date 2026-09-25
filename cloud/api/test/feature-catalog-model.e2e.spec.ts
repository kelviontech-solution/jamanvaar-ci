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
});
