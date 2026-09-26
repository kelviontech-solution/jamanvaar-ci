import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/** Restaurant, owner and subscription must never disagree about whether the restaurant is running. */
describe('restaurant / owner / subscription status stay in step', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let planId: string;
  let restaurantId: string;
  let subId: string;
  let ownerId: string;
  const stamp = Date.now();
  const adminEmail = `test-status-admin-${stamp}@example.com`;
  const call = (method: 'get' | 'post' | 'patch', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  const owner = async () => (await call('get', '/api/v1/owners')).body.find((o: { id: string }) => o.id === ownerId);
  const sub = async () => (await call('get', '/api/v1/subscriptions')).body.find((s: { id: string }) => s.id === subId);
  const restaurant = async () => (await call('get', `/api/v1/restaurants/${restaurantId}`)).body;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    token = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;
    planId = (await call('post', '/api/v1/plans').send({ tier: 'PRO', name: `TEST Status Plan ${stamp}`, priceMonthly: 100000, maxBranches: 2, maxDevices: 5, maxUsers: 5, entitlements: { posTerminal: true } })).body.id;
    const r = await call('post', '/api/v1/restaurants').send({ name: `TEST Status ${stamp}`, mobile: `9${String(stamp).slice(-9)}`, ownerName: 'Owner', ownerEmail: `status-${stamp}@test.example.com`, ownerPassword: 'Correct-Horse-9-Battery', skipInviteEmail: true });
    restaurantId = r.body.restaurant.id;
    ownerId = r.body.owner.id;
    subId = (await call('post', '/api/v1/subscriptions').send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() })).body.id;
  });
  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('suspending the restaurant suspends its subscription and shows the owner as suspended', async () => {
    expect((await owner()).status).toBe('ACTIVE');
    await call('patch', `/api/v1/restaurants/${restaurantId}/suspend`);
    expect((await sub()).status).toBe('SUSPENDED');
    expect((await owner()).status).toBe('DISABLED');
  });

  it('reactivating the subscription brings the restaurant and the owner back', async () => {
    await call('patch', `/api/v1/subscriptions/${subId}/reactivate`);
    expect((await sub()).status).toBe('ACTIVE');
    expect((await restaurant()).status).toBe('ACTIVE');
    expect((await owner()).status).toBe('ACTIVE');
  });

  it('suspending the only subscription suspends the restaurant; reactivating the restaurant resumes the subscription', async () => {
    await call('patch', `/api/v1/subscriptions/${subId}/suspend`);
    expect((await restaurant()).status).toBe('SUSPENDED');
    expect((await owner()).status).toBe('DISABLED');
    await call('patch', `/api/v1/restaurants/${restaurantId}/reactivate`);
    expect((await sub()).status).toBe('ACTIVE');
    expect((await owner()).status).toBe('ACTIVE');
  });
});
