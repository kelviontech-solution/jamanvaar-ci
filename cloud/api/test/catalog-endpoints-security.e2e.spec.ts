import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

type Role = 'READ_ONLY' | 'SUPPORT_ADMIN' | 'FINANCE_ADMIN' | 'SUPER_ADMIN';

describe('Feature catalog endpoints: authentication and role access (Phase 15)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const password = 'correct-horse-battery-staple';
  const roles: Role[] = ['READ_ONLY', 'SUPPORT_ADMIN', 'FINANCE_ADMIN', 'SUPER_ADMIN'];
  const tokens = {} as Record<Role, string>;
  const emails = roles.map((r) => `test-sec-${r.toLowerCase()}-${stamp}@example.com`);

  const as = (role: Role, method: 'get' | 'post' | 'patch' | 'delete', url: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${tokens[role]}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    for (const [i, role] of roles.entries()) {
      await createTestPlatformUser(prisma, { email: emails[i], password, role });
      tokens[role] = (await platformLogin(app, emails[i], password)).body.accessToken;
    }
  });

  afterAll(async () => {
    await prisma.platformUser.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  const endpoints: Array<['get' | 'post' | 'patch' | 'delete', string]> = [
    ['get', '/api/v1/features'],
    ['post', '/api/v1/features'],
    ['patch', '/api/v1/features/x'],
    ['delete', '/api/v1/features/x'],
    ['get', '/api/v1/feature-categories'],
    ['post', '/api/v1/feature-categories'],
    ['patch', '/api/v1/feature-categories/x'],
    ['get', '/api/v1/application-entitlements/catalog']
  ];

  it('every catalog endpoint rejects unauthenticated requests with 401', async () => {
    for (const [method, url] of endpoints) {
      const res = await request(app.getHttpServer())[method](url);
      expect(res.status, `${method} ${url}`).toBe(401);
    }
  });

  it('read-only style roles can read the catalog (the console pages depend on it)', async () => {
    for (const role of ['READ_ONLY', 'SUPPORT_ADMIN'] as Role[]) {
      for (const url of ['/api/v1/features', '/api/v1/feature-categories', '/api/v1/application-entitlements/catalog']) {
        expect((await as(role, 'get', url)).status, `${role} GET ${url}`).toBe(200);
      }
    }
  });

  it('read-only style roles cannot modify the catalog (403, never reaching validation)', async () => {
    for (const role of ['READ_ONLY', 'SUPPORT_ADMIN'] as Role[]) {
      for (const [method, url] of [['post', '/api/v1/features'], ['patch', '/api/v1/features/x'], ['delete', '/api/v1/features/x'], ['post', '/api/v1/feature-categories'], ['patch', '/api/v1/feature-categories/x']] as const) {
        expect((await as(role, method, url).send({})).status, `${role} ${method} ${url}`).toBe(403);
      }
    }
  });

  it('a role with subscriptions:write can edit the catalog (reaches validation, not 403)', async () => {
    const res = await as('FINANCE_ADMIN', 'post', '/api/v1/features').send({});
    expect(res.status).toBe(400);
  });
});
