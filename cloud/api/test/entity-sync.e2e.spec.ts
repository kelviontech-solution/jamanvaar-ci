import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * The generic sync bridge extension (Phase 5 of the remediation sequence) —
 * one flexible table/endpoint pair reused across CRM/Inventory/Payments-
 * reporting instead of a bespoke SyncedOrder-style model per domain.
 */
describe('Generic entity sync bridge (CRM/Inventory/Payments)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-entity-sync-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  let posToken: string;

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email: adminEmail, password: adminPassword });
    platformToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Entity Sync Restaurant ${Date.now()}`,
      ownerName: 'Entity Sync Owner',
      ownerEmail: `entity-sync-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;

    const planRes = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO', name: `TEST Entity Sync Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { pos: true }
    });
    planId = planRes.body.id;
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });

    const keyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const redeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: keyRes.body.code, deviceType: 'POS' });
    posToken = redeemRes.body.deviceToken;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('rejects an unknown entity type', async () => {
    const res = await authed('post', '/api/v1/entity-sync/NOT_A_REAL_TYPE', posToken).send({
      events: [{ externalId: '9999999999', payload: { name: 'Test' } }]
    });
    expect(res.status).toBe(400);
  });

  it('pushes and pulls a CUSTOMER record end to end', async () => {
    const pushRes = await authed('post', '/api/v1/entity-sync/CUSTOMER', posToken).send({
      events: [{ externalId: '9876543210', payload: { name: 'Priya Sharma', loyaltyPoints: 120, tags: ['VIP'] } }]
    });
    expect(pushRes.status).toBe(201);
    expect(pushRes.body.results).toEqual([{ externalId: '9876543210', status: 'ok', syncVersion: 1 }]);

    const pullRes = await authed('get', '/api/v1/entity-sync/CUSTOMER', posToken);
    expect(pullRes.body.entities).toHaveLength(1);
    expect(pullRes.body.entities[0]).toMatchObject({
      externalId: '9876543210',
      payload: { name: 'Priya Sharma', loyaltyPoints: 120, tags: ['VIP'] }
    });
  });

  it('re-pushing the same externalId within one entityType updates in place, not a new row', async () => {
    await authed('post', '/api/v1/entity-sync/CUSTOMER', posToken).send({
      events: [{ externalId: '9876543210', payload: { name: 'Priya Sharma', loyaltyPoints: 150, tags: ['VIP', 'REGULAR'] } }]
    });

    const rows = await prisma.runAsTenant(restaurantId, (tx) => tx.syncedEntity.findMany({ where: { entityType: 'CUSTOMER', externalId: '9876543210' } }));
    expect(rows).toHaveLength(1);
    expect(rows[0].syncVersion).toBe(2);
    expect((rows[0].payload as any).loyaltyPoints).toBe(150);
  });

  it('keeps CUSTOMER and INVENTORY_ITEM rows fully separate even with the same externalId', async () => {
    await authed('post', '/api/v1/entity-sync/INVENTORY_ITEM', posToken).send({
      events: [{ externalId: '9876543210', payload: { name: 'Basmati Rice', currentStock: 40, unit: 'kg' } }]
    });

    const customerPull = await authed('get', '/api/v1/entity-sync/CUSTOMER', posToken);
    const inventoryPull = await authed('get', '/api/v1/entity-sync/INVENTORY_ITEM', posToken);
    expect(customerPull.body.entities).toHaveLength(1);
    expect(inventoryPull.body.entities).toHaveLength(1);
    expect(customerPull.body.entities[0].payload.name).toBe('Priya Sharma');
    expect(inventoryPull.body.entities[0].payload.name).toBe('Basmati Rice');
  });

  it('pushes and pulls a MENU_ITEM — the database-layer extension that gives a restaurant\'s menu real cloud persistence instead of living only in one device\'s browser storage', async () => {
    const pushRes = await authed('post', '/api/v1/entity-sync/MENU_ITEM', posToken).send({
      events: [{ externalId: 'item-butter-naan', payload: { name: 'Butter Naan', price: 60, categoryId: 'cat-breads', isAvailable: true } }]
    });
    expect(pushRes.status).toBe(201);

    const pullRes = await authed('get', '/api/v1/entity-sync/MENU_ITEM', posToken);
    expect(pullRes.body.entities).toHaveLength(1);
    expect(pullRes.body.entities[0]).toMatchObject({ externalId: 'item-butter-naan', payload: { name: 'Butter Naan', price: 60 } });
  });
});
