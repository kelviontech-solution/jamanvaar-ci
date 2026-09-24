import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * BUG-015: Super Admin had no Menu tab on a restaurant, and the master-catalog "syndicate"
 * never actually reached any restaurant's terminals. Super Admin can now read and import a
 * restaurant's menu directly (landing in the same SyncedEntity store a device's MENU_ITEM/
 * MENU_CATEGORY entity-sync push/pull already reads — so a Super Admin upload reaches POS
 * the same way a Restaurant Admin one does, no new delivery path needed), and can grant or
 * revoke whether the Restaurant Admin may upload their own.
 */
describe('Super Admin restaurant menu (BUG-015)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-menu-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let token: string;
  let restaurantId: string;

  const api = (method: 'get' | 'post' | 'patch', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    token = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;
    const rest = await api('post', '/api/v1/restaurants').send({ name: `TEST Menu ${Date.now()}`, ownerName: 'Owner', ownerEmail: `menu-${Date.now()}@test.example.com` });
    restaurantId = rest.body.restaurant.id;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('a new restaurant has an empty menu and self-upload defaults to allowed', async () => {
    const res = await api('get', `/api/v1/restaurants/${restaurantId}/menu`);
    expect(res.status).toBe(200);
    expect(res.body.categories).toEqual([]);
    expect(res.body.items).toEqual([]);
    expect(res.body.selfUploadEnabled).toBe(true);
  });

  it('imports categories and items that a device would then pull via entity-sync', async () => {
    const res = await api('post', `/api/v1/restaurants/${restaurantId}/menu/import`).send({
      categories: [{ externalId: 'cat-1', payload: { id: 'cat-1', name: 'Starters' } }],
      items: [{ externalId: 'item-1', payload: { id: 'item-1', categoryId: 'cat-1', name: 'Spring Roll', price: 180 } }]
    });
    expect(res.status).toBe(201);
    expect(res.body.categoriesImported).toBe(1);
    expect(res.body.itemsImported).toBe(1);

    const menu = await api('get', `/api/v1/restaurants/${restaurantId}/menu`);
    expect(menu.body.items).toHaveLength(1);
    expect(menu.body.items[0].payload.name).toBe('Spring Roll');
  });

  it('re-importing the same externalId updates it in place, not duplicates it', async () => {
    await api('post', `/api/v1/restaurants/${restaurantId}/menu/import`).send({
      categories: [],
      items: [{ externalId: 'item-1', payload: { id: 'item-1', categoryId: 'cat-1', name: 'Spring Roll (Updated)', price: 200 } }]
    });
    const menu = await api('get', `/api/v1/restaurants/${restaurantId}/menu`);
    expect(menu.body.items).toHaveLength(1);
    expect(menu.body.items[0].payload.name).toBe('Spring Roll (Updated)');
  });

  it('can revoke and restore the restaurant admin self-upload permission', async () => {
    const off = await api('patch', `/api/v1/restaurants/${restaurantId}/menu/permission`).send({ enabled: false });
    expect(off.status).toBe(200);
    expect((await api('get', `/api/v1/restaurants/${restaurantId}/menu`)).body.selfUploadEnabled).toBe(false);

    const on = await api('patch', `/api/v1/restaurants/${restaurantId}/menu/permission`).send({ enabled: true });
    expect(on.status).toBe(200);
    expect((await api('get', `/api/v1/restaurants/${restaurantId}/menu`)).body.selfUploadEnabled).toBe(true);
  });

  it('rejects an import with no externalId or an empty batch', async () => {
    const empty = await api('post', `/api/v1/restaurants/${restaurantId}/menu/import`).send({ categories: [], items: [] });
    expect(empty.status).toBe(400);

    const bad = await api('post', `/api/v1/restaurants/${restaurantId}/menu/import`).send({ categories: [], items: [{ payload: { name: 'No id' } }] });
    expect(bad.status).toBe(400);
  });
});
