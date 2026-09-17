import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Real QR-table activity has always existed at the restaurant level — the
 * platform-level QR Ordering Suite in Super Admin showed 0 usage for every
 * restaurant because no client ever called this already-real reporting
 * endpoint (POST /api/v1/tenant/qr-ordering/usage), not because the pipe
 * itself was broken. This proves the full tenant-report -> platform-read
 * round trip actually works now that pos-admin calls it.
 */
describe('QR ordering usage: tenant report -> platform read', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-qr-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let ownerAccessToken: string;
  const ownerEmail = `test-qr-owner-${Date.now()}@example.com`;
  const ownerPassword = 'owner-correct-horse-battery';

  const authed = (method: 'get' | 'post' | 'patch', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const platformLogin = await request(app.getHttpServer())
      .post('/api/v1/platform-auth/login')
      .send({ email: adminEmail, password: adminPassword });
    platformToken = platformLogin.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST QR Ordering Restaurant ${Date.now()}`,
      ownerName: 'QR Ordering Test Owner',
      ownerEmail
    });
    restaurantId = restaurantRes.body.restaurant.id;
    const ownerActivationToken = restaurantRes.body.activationToken;

    await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/set-initial-password')
      .send({ restaurantId, email: ownerEmail, activationToken: ownerActivationToken, newPassword: ownerPassword });

    const ownerLogin = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: ownerEmail, password: ownerPassword });
    ownerAccessToken = ownerLogin.body.accessToken;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('platform sees zero usage before any report is sent', async () => {
    const res = await authed('get', `/api/v1/qr-ordering/restaurants/${restaurantId}/usage`, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.usage?.ordersToday ?? 0).toBe(0);
  });

  it('a tenant-reported usage snapshot is immediately visible to Super Admin', async () => {
    const reportRes = await authed('post', '/api/v1/tenant/qr-ordering/usage', ownerAccessToken).send({
      activeTables: 4,
      ordersToday: 17,
      revenueToday: 542300
    });
    expect(reportRes.status).toBe(201);

    const readRes = await authed('get', `/api/v1/qr-ordering/restaurants/${restaurantId}/usage`, platformToken);
    expect(readRes.status).toBe(200);
    expect(readRes.body.usage).toMatchObject({ activeTables: 4, ordersToday: 17, revenueToday: 542300 });
  });

  it('a device/POS staff session cannot report usage for another restaurant (tenant isolation)', async () => {
    const otherRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Other QR Restaurant ${Date.now()}`,
      ownerName: 'Other Owner',
      ownerEmail: `test-qr-other-owner-${Date.now()}@example.com`
    });
    const otherRestaurantId = otherRes.body.restaurant.id;

    const readRes = await authed('get', `/api/v1/qr-ordering/restaurants/${otherRestaurantId}/usage`, platformToken);
    expect(readRes.status).toBe(200);
    expect(readRes.body.usage?.ordersToday ?? 0).toBe(0);

    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: otherRestaurantId } }));
  });
});
