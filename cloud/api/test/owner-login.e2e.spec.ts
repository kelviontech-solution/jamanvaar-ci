import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Owner-only restaurant-code login (Phase 3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let platformToken: string;
  const stamp = Date.now();
  const adminEmail = `test-ownerlogin-admin-${stamp}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  const ownerPassword = 'the-owners-password-1';
  const ownerEmail = `owner-login-${stamp}@example.com`;
  let restaurantId: string;
  let restaurantCode: string;
  const createdRestaurantIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    platformToken = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;

    const create = await request(app.getHttpServer()).post('/api/v1/restaurants').set('Authorization', `Bearer ${platformToken}`).send({
      name: `TEST Owner Login ${stamp}`, mobile: `9${String(stamp).slice(-9)}`, ownerName: 'Owner', ownerEmail
    });
    restaurantId = create.body.restaurant.id;
    restaurantCode = create.body.restaurant.restaurantCode;
    createdRestaurantIds.push(restaurantId);

    await request(app.getHttpServer()).post('/api/v1/tenant-auth/set-initial-password').send({
      restaurantId, email: ownerEmail, activationToken: create.body.activationToken, newPassword: ownerPassword
    });
  });

  afterAll(async () => {
    if (createdRestaurantIds.length) await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('logs the owner in with just restaurantCode + password, no email', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantCode, password: ownerPassword });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(ownerEmail);
    expect(res.body.user.role).toBe('OWNER');
    expect(res.body.accessToken).toBeDefined();
  });

  it('rejects the wrong password with the same generic message the email login uses', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantCode, password: 'not-the-password' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid/i);
  });

  it('404s for an unknown restaurantCode', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantCode: 'JM6000000099', password: ownerPassword });
    expect(res.status).toBe(404);
  });

  it('locks the owner account out after enough wrong passwords, same as email-login', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantCode, password: `wrong-${i}` });
    }
    const res = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login-owner').send({ restaurantCode, password: ownerPassword });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/too many failed attempts/i);
  });
});
