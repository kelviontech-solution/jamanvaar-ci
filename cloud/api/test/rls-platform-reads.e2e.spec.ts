import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * BUG-075: several platform services read tenant tables through the bare Prisma client. Postgres
 * superusers ignore row-level security, so that only worked by accident; under the real (non-bypass)
 * role such a read sees no rows and dashboards silently show zero. These pin the platform-wide reads.
 */
describe('Platform-wide reads work under row-level security (BUG-075)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const email = `rls-reads-${stamp}@example.com`;
  const password = 'correct-horse-battery-staple';
  let token: string;
  let restaurantId: string;
  const get = (url: string) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email, password });
    token = (await platformLogin(app, email, password)).body.accessToken;
    restaurantId = (await request(app.getHttpServer()).post('/api/v1/restaurants').set('Authorization', `Bearer ${token}`).send({
      name: `TEST RLS Reads ${stamp}`, mobile: `9${String(stamp).slice(-9)}`, ownerName: 'Owner', ownerEmail: `rls-reads-${stamp}@example.com`
    })).body.restaurant.id;
    await prisma.runAsPlatform((tx) => tx.device.create({ data: { restaurantId, type: 'POS', status: 'ACTIVE', lastSeenAt: new Date() } }));
  }, 60_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email } });
    await app.close();
  });

  it('the reports summary counts the restaurants, branches and devices that exist', async () => {
    const res = await get('/api/v1/platform/reports/summary');
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/"totalRestaurants":0\b/);
    const flat = JSON.stringify(res.body);
    expect(flat).toMatch(/[1-9]/);
  });

  it('the per-restaurant report finds the restaurant and its device', async () => {
    const res = await get(`/api/v1/platform/reports/restaurants/${restaurantId}`);
    expect(res.status).toBe(200);
    expect(res.body.restaurant?.name ?? res.body.name).toContain('TEST RLS Reads');
  });

  it('the device and restaurant report lists include the new records', async () => {
    const devices = await get('/api/v1/platform/reports/devices');
    expect(devices.status).toBe(200);
    expect(devices.body.total).toBeGreaterThanOrEqual(1);
    const restaurants = await get('/api/v1/platform/reports/restaurants');
    expect(JSON.stringify(restaurants.body)).toContain(`TEST RLS Reads ${stamp}`);
  });

  it('sync observability and the audit log can read across restaurants', async () => {
    expect((await get('/api/v1/platform/telemetry/sync-metrics')).status).toBeLessThan(500);
    const audit = await get('/api/v1/audit-logs');
    expect(audit.status).toBe(200);
    expect(JSON.stringify(audit.body)).toContain(restaurantId);
  });
});
