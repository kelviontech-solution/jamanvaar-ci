import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Restaurant management (Phase 1a)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  const adminEmail = `test-restaurants-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  const restaurantName = `TEST — Tandoor Express ${Date.now()}`;
  const createdRestaurantIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await platformLogin(app, adminEmail, adminPassword);
    accessToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    // Cascades to Branch/User/Subscription/ActivationKey/Device. Restaurant
    // is RLS-protected, so this must run inside a platform context — a bare
    // deleteMany() here silently affects zero rows instead of erroring,
    // which is correct RLS behavior but a footgun for cleanup code (see
    // saas-modules.e2e.spec.ts's discovery of the same issue).
    if (createdRestaurantIds.length) {
      await prisma.runAsPlatform((tx) =>
        tx.restaurant.deleteMany({ where: { id: { in: createdRestaurantIds } } })
      );
    }
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('rejects restaurant creation without a platform token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/restaurants')
      .send({ name: restaurantName, ownerName: 'Owner', ownerEmail: 'owner@test.example.com' });
    expect(res.status).toBe(401);
  });

  it('rejects invalid input (missing required fields)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/restaurants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'A' }); // too short, no owner fields
    expect(res.status).toBe(400);
    expect(res.body.issues).toBeInstanceOf(Array);
    expect(res.body.issues.length).toBeGreaterThan(0);
  });

  it('creates a restaurant with a default branch and a pending owner account', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/restaurants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: restaurantName,
        city: 'Ahmedabad',
        state: 'Gujarat',
        mobile: '9876500001',
        ownerName: 'Test Owner',
        ownerEmail: `owner-${Date.now()}@test.example.com`,
        ownerPhone: '9999999999'
      });

    expect(res.status).toBe(201);
    expect(res.body.restaurant.name).toBe(restaurantName);
    expect(res.body.restaurant.status).toBe('ACTIVE');
    expect(res.body.branch.code).toBe('MAIN');
    expect(res.body.owner.role).toBe('OWNER');
    expect(res.body.owner.status).toBe('PENDING_ACTIVATION');
    // The owner has no password yet — nothing resembling one should be returned.
    expect(res.body.owner).not.toHaveProperty('passwordHash');

    createdRestaurantIds.push(res.body.restaurant.id);
  });

  it('allows restaurant creation with no mobile number, leaving restaurantCode null', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/restaurants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `${restaurantName} No Mobile`,
        ownerName: 'Test Owner',
        ownerEmail: `owner-nomobile-${Date.now()}@test.example.com`
      });
    expect(res.status).toBe(201);
    expect(res.body.restaurant.restaurantCode).toBeNull();
    expect(res.body.restaurant.mobile).toBeNull();
    createdRestaurantIds.push(res.body.restaurant.id);
  });

  it('rejects a malformed mobile number when one is given', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/restaurants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `${restaurantName} Bad Mobile`,
        mobile: '12345',
        ownerName: 'Test Owner',
        ownerEmail: `owner-badmobile-${Date.now()}@test.example.com`
      });
    expect(res.status).toBe(400);
  });

  it('generates a JM-prefixed restaurantCode from the mobile number', async () => {
    const mobile = '9876543210';
    const res = await request(app.getHttpServer())
      .post('/api/v1/restaurants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `${restaurantName} With Mobile`,
        mobile,
        ownerName: 'Test Owner',
        ownerEmail: `owner-code-${Date.now()}@test.example.com`
      });

    expect(res.status).toBe(201);
    expect(res.body.restaurant.restaurantCode).toBe('JM9876543210');
    expect(res.body.restaurant.mobile).toBe(mobile);
    expect(res.body.restaurant.restaurantCodeIsFallback).toBe(false);
    createdRestaurantIds.push(res.body.restaurant.id);
  });

  it('assigns a different code to a second restaurant with a different mobile', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/restaurants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `${restaurantName} Second`,
        mobile: '9123456780',
        ownerName: 'Test Owner',
        ownerEmail: `owner-second-${Date.now()}@test.example.com`
      });
    expect(res.status).toBe(201);
    expect(res.body.restaurant.restaurantCode).toBe('JM9123456780');
    createdRestaurantIds.push(res.body.restaurant.id);
  });

  it('rejects two restaurants sharing the same mobile number (same code would collide)', async () => {
    const mobile = '9111122223';
    const first = await request(app.getHttpServer())
      .post('/api/v1/restaurants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `${restaurantName} Dup A`, mobile, ownerName: 'Owner A', ownerEmail: `owner-dupa-${Date.now()}@test.example.com` });
    expect(first.status).toBe(201);
    createdRestaurantIds.push(first.body.restaurant.id);

    const second = await request(app.getHttpServer())
      .post('/api/v1/restaurants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `${restaurantName} Dup B`, mobile, ownerName: 'Owner B', ownerEmail: `owner-dupb-${Date.now()}@test.example.com` });
    expect(second.status).toBe(409);
  });

  it('restaurantCode cannot be changed via the update endpoint', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/v1/restaurants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `${restaurantName} Immutable`, mobile: '9988776655', ownerName: 'Owner', ownerEmail: `owner-immut-${Date.now()}@test.example.com` });
    createdRestaurantIds.push(create.body.restaurant.id);
    const originalCode = create.body.restaurant.restaurantCode;

    const update = await request(app.getHttpServer())
      .patch(`/api/v1/restaurants/${create.body.restaurant.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ restaurantCode: 'JM0000000000', name: `${restaurantName} Renamed` });
    expect(update.status).toBe(200);
    expect(update.body.restaurantCode).toBe(originalCode);
    expect(update.body.name).toBe(`${restaurantName} Renamed`);
  });

  it('mobile can be edited via the update endpoint, but restaurantCode does not follow it', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/v1/restaurants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `${restaurantName} Mobile Edit`, mobile: '9700011122', ownerName: 'Owner', ownerEmail: `owner-mobedit-${Date.now()}@test.example.com` });
    createdRestaurantIds.push(create.body.restaurant.id);
    const originalCode = create.body.restaurant.restaurantCode;
    expect(originalCode).toBe('JM9700011122');

    const update = await request(app.getHttpServer())
      .patch(`/api/v1/restaurants/${create.body.restaurant.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ mobile: '9700099988' });
    expect(update.status).toBe(200);
    expect(update.body.mobile).toBe('9700099988');
    expect(update.body.restaurantCode).toBe(originalCode);
  });

  it('rejects a malformed mobile number on update', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/v1/restaurants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `${restaurantName} Bad Mobile Update`, ownerName: 'Owner', ownerEmail: `owner-badmobupd-${Date.now()}@test.example.com` });
    createdRestaurantIds.push(create.body.restaurant.id);

    const update = await request(app.getHttpServer())
      .patch(`/api/v1/restaurants/${create.body.restaurant.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ mobile: 'not-a-phone' });
    expect(update.status).toBe(400);
  });

  it('lists restaurants including the one just created', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/restaurants')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.some((r: { id: string }) => r.id === createdRestaurantIds[0])).toBe(true);
  });

  it('returns restaurant detail with branches and owner', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/restaurants/${createdRestaurantIds[0]}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.branches.length).toBe(1);
    expect(res.body.users.length).toBe(1);
    expect(res.body.users[0].role).toBe('OWNER');
  });

  it('updates restaurant profile fields and audits the change', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/restaurants/${createdRestaurantIds[0]}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ gstin: '24AAAAA0000A1Z5', city: 'Surat' });

    expect(res.status).toBe(200);
    expect(res.body.gstin).toBe('24AAAAA0000A1Z5');
    expect(res.body.city).toBe('Surat');
  });

  it('returns 404 for a restaurant that does not exist', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/restaurants/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });

  it('suspends and reactivates a restaurant, writing an audit record each time', async () => {
    const id = createdRestaurantIds[0];

    const suspendRes = await request(app.getHttpServer())
      .patch(`/api/v1/restaurants/${id}/suspend`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(suspendRes.status).toBe(200);
    expect(suspendRes.body.status).toBe('SUSPENDED');

    const reactivateRes = await request(app.getHttpServer())
      .patch(`/api/v1/restaurants/${id}/reactivate`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.status).toBe('ACTIVE');

    const auditRows = await prisma.auditLog.findMany({
      where: { restaurantId: id, category: 'RESTAURANT' },
      orderBy: { createdAt: 'asc' }
    });
    expect(auditRows.map((r) => r.action)).toEqual(
      expect.arrayContaining(['RESTAURANT_CREATED', 'RESTAURANT_SUSPENDED', 'RESTAURANT_ACTIVE'])
    );
  });
});
