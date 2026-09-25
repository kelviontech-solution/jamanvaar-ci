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

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    platformToken = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;
  });

  afterAll(async () => {
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
});
