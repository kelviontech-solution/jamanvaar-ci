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
