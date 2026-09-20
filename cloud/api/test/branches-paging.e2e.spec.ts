import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/** BUG-047: the branches list loaded every branch of every restaurant and the browser did the rest. */
describe('Branches list is paged, searched and filtered on the server (BUG-047)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const email = `branches-owner-${stamp}@example.com`;
  const password = 'correct-horse-battery-staple';
  let token: string;
  let restaurantId: string;
  // Creating a restaurant also creates its default branch, so there are 4 in total.
  const branchIds: string[] = [];

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const get = (q: Record<string, string | number>) => auth(request(app.getHttpServer()).get('/api/v1/branches')).query(q);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email, password });
    token = (await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email, password })).body.accessToken;
    const r = await auth(request(app.getHttpServer()).post('/api/v1/restaurants')).send({
      name: `TEST Branch Paging ${stamp}`, ownerName: 'Owner', ownerEmail: `branch-paging-${stamp}@example.com`
    });
    restaurantId = r.body.restaurant.id;
    for (const [name, code] of [['Alpha Kitchen', 'AK'], ['Beta Bistro', 'BB'], ['Gamma Grill', 'GG']]) {
      const res = await auth(request(app.getHttpServer()).post('/api/v1/branches')).send({ restaurantId, name, code });
      branchIds.push(res.body.id);
    }
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email } });
    await app.close();
  });

  it('without a page it still returns the plain array', async () => {
    const res = await get({ restaurantId });
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(4);
  });

  it('with a page it returns one page plus the total and status counts', async () => {
    const res = await get({ restaurantId, page: 1, pageSize: 2 });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body).toMatchObject({ total: 4, page: 1, pageSize: 2, totalPages: 2, statusCounts: { ACTIVE: 4, INACTIVE: 0 } });
    expect((await get({ restaurantId, page: 2, pageSize: 2 })).body.items).toHaveLength(2);
  });

  it('searches by name or code on the server', async () => {
    expect((await get({ restaurantId, page: 1, q: 'bistro' })).body.items.map((b: { name: string }) => b.name)).toEqual(['Beta Bistro']);
    expect((await get({ restaurantId, page: 1, q: 'gg' })).body.items.map((b: { code: string }) => b.code)).toEqual(['GG']);
    expect((await get({ restaurantId, page: 1, q: 'zzz-nothing' })).body.total).toBe(0);
  });

  it('applies many status changes in ONE call, and the filter and counts follow', async () => {
    const res = await auth(request(app.getHttpServer()).post('/api/v1/branches/bulk-status')).send({ ids: branchIds.slice(0, 2), status: 'INACTIVE' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ updated: 2 });

    const inactive = await get({ restaurantId, page: 1, status: 'INACTIVE' });
    expect(inactive.body.total).toBe(2);
    expect(inactive.body.statusCounts).toEqual({ ACTIVE: 2, INACTIVE: 2 });
  });

  it('refuses a bulk change with no ids or an unknown status', async () => {
    expect((await auth(request(app.getHttpServer()).post('/api/v1/branches/bulk-status')).send({ ids: [], status: 'INACTIVE' })).status).toBe(400);
    expect((await auth(request(app.getHttpServer()).post('/api/v1/branches/bulk-status')).send({ ids: branchIds, status: 'DELETED' })).status).toBe(400);
  });
});
