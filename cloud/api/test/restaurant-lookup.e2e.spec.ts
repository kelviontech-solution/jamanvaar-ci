import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Restaurant-code lookup (Phase 1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  const adminEmail = `test-lookup-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  const createdRestaurantIds: string[] = [];
  let restaurantId: string;
  const restaurantName = `TEST — Lookup Cafe ${Date.now()}`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    accessToken = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;

    const create = await request(app.getHttpServer())
      .post('/api/v1/restaurants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: restaurantName, mobile: '9812345670', ownerName: 'Owner', ownerEmail: `owner-lookup-${Date.now()}@test.example.com` });
    restaurantId = create.body.restaurant.id;
    createdRestaurantIds.push(restaurantId);
  });

  afterAll(async () => {
    if (createdRestaurantIds.length) {
      await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } }));
    }
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('resolves a valid restaurantCode with no authentication required', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/restaurant-lookup/resolve')
      .send({ restaurantCode: 'JM9812345670' });
    expect(res.status).toBe(200);
    expect(res.body.restaurantId).toBe(restaurantId);
    expect(res.body.name).toBe(restaurantName);
  });

  it('is case-insensitive on the code', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/restaurant-lookup/resolve')
      .send({ restaurantCode: 'jm9812345670' });
    expect(res.status).toBe(200);
    expect(res.body.restaurantId).toBe(restaurantId);
  });

  it('returns 404 for an unknown code', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/restaurant-lookup/resolve')
      .send({ restaurantCode: 'JM6000000001' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for a malformed code, not a 500', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/restaurant-lookup/resolve')
      .send({ restaurantCode: 'not-a-code' });
    expect(res.status).toBe(400);
  });

  it('never returns internal fields like ownerEmail, gstin, or the raw database id list', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/restaurant-lookup/resolve')
      .send({ restaurantCode: 'JM9812345670' });
    expect(Object.keys(res.body).sort()).toEqual(['name', 'restaurantId']);
  });
});
