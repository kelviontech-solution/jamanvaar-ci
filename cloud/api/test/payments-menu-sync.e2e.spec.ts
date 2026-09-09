import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Menu snapshot sync (Kiosk Admin -> cloud)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-menu-sync-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  let kioskAdminToken: string;
  let posToken: string;

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/platform-auth/login')
      .send({ email: adminEmail, password: adminPassword });
    platformToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Menu Sync Restaurant ${Date.now()}`,
      ownerName: 'Menu Sync Owner',
      ownerEmail: `menu-sync-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;

    const planRes = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO',
      name: `TEST Menu Sync Plan ${Date.now()}`,
      priceMonthly: 700000,
      maxBranches: 3,
      maxDevices: 20,
      maxUsers: 20,
      entitlements: { kiosk: true }
    });
    planId = planRes.body.id;
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId,
      planId,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });

    const keyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({
      restaurantId,
      allowedDeviceType: 'KIOSK_ADMIN',
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    const redeemRes = await request(app.getHttpServer())
      .post('/api/v1/activation/redeem')
      .send({ code: keyRes.body.code, deviceType: 'KIOSK_ADMIN' });
    kioskAdminToken = redeemRes.body.deviceToken;

    const posKeyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({
      restaurantId,
      allowedDeviceType: 'POS',
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    const posRedeemRes = await request(app.getHttpServer())
      .post('/api/v1/activation/redeem')
      .send({ code: posKeyRes.body.code, deviceType: 'POS' });
    posToken = posRedeemRes.body.deviceToken;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  const sampleItem = {
    externalItemId: 'thali-1',
    name: 'Gujarati Thali',
    basePrice: 25000,
    taxRate: 500,
    modifierGroups: [
      {
        id: 'spice',
        name: 'Spice Level',
        isRequired: true,
        minSelections: 1,
        maxSelections: 1,
        options: [
          { id: 'mild', name: 'Mild', priceDelta: 0 },
          { id: 'extra-hot', name: 'Extra Hot', priceDelta: 1000 }
        ]
      }
    ]
  };

  it('a Kiosk Admin device can push a menu snapshot and it round-trips exactly', async () => {
    const res = await authed('post', '/api/v1/tenant/menu-sync', kioskAdminToken).send({ items: [sampleItem] });
    expect(res.status).toBe(201);
    expect(res.body.synced).toBe(1);

    const row = await prisma.runAsPlatform((tx) =>
      tx.menuSnapshotItem.findUniqueOrThrow({ where: { restaurantId_externalItemId: { restaurantId, externalItemId: 'thali-1' } } })
    );
    expect(row.basePrice).toBe(25000);
    expect(row.taxRate).toBe(500);
  });

  it('re-syncing the same externalItemId updates the row instead of creating a duplicate', async () => {
    await authed('post', '/api/v1/tenant/menu-sync', kioskAdminToken).send({ items: [{ ...sampleItem, basePrice: 27500 }] });

    const rows = await prisma.runAsPlatform((tx) => tx.menuSnapshotItem.findMany({ where: { restaurantId, externalItemId: 'thali-1' } }));
    expect(rows.length).toBe(1);
    expect(rows[0].basePrice).toBe(27500);
  });

  it('a non-Kiosk-Admin device (e.g. POS) cannot push a menu snapshot', async () => {
    const res = await authed('post', '/api/v1/tenant/menu-sync', posToken).send({ items: [sampleItem] });
    expect(res.status).toBe(403);
  });

  it('rejects an empty items array', async () => {
    const res = await authed('post', '/api/v1/tenant/menu-sync', kioskAdminToken).send({ items: [] });
    expect(res.status).toBe(400);
  });
});
