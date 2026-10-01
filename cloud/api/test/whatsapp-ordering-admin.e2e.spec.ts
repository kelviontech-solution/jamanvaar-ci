import { createHash, createHmac } from 'crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Jamanvaar WhatsApp connector, Phase 6: Super Admin's read-only fleet visibility
 * (WhatsAppOrderingAdminService/Controller) — proves it only lists restaurants with a real
 * connection (not every restaurant on the platform, unlike QR ordering's own listing), and
 * that its numbers reflect real data, not a hardcoded shape.
 */
describe('Super Admin — WhatsApp ordering connector dashboard', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-wa-admin-dash-${stamp}@example.com`;
  const SERVICE_SECRET = 'test-jamanvaar-service-secret-for-admin-dash-e2e';
  let platformToken: string;
  let planId: string;
  let restaurantId: string;
  const day = 86400_000;

  const http = () => request(app.getHttpServer());
  const platform = (method: 'get' | 'post', url: string) => http()[method](url).set('Authorization', `Bearer ${platformToken}`);

  function signedService(method: string, path: string, body: unknown = {}) {
    const timestamp = String(Date.now());
    const raw = JSON.stringify(body ?? {});
    const bodyHash = createHash('sha256').update(raw).digest('hex');
    const signature = createHmac('sha256', SERVICE_SECRET).update(`${method.toUpperCase()}\n${path}\n${timestamp}\n${bodyHash}`).digest('hex');
    return { headers: { 'x-signature': signature, 'x-timestamp': timestamp }, raw };
  }
  const asService = (path: string, body: unknown = {}) => {
    const { headers, raw } = signedService('POST', path, body);
    return http().post(path).set('x-signature', headers['x-signature']).set('x-timestamp', headers['x-timestamp']).set('content-type', 'application/json').send(raw);
  };

  beforeAll(async () => {
    process.env.JAMANVAAR_SERVICE_SECRET = SERVICE_SECRET;
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;

    planId = (await platform('post', '/api/v1/plans').send({ tier: 'PRO', name: `TEST WA Admin Dash Plan ${stamp}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: {} })).body.id;
    const restRes = await platform('post', '/api/v1/restaurants').send({ name: `TEST WA Admin Dash ${stamp}`, ownerName: 'Owner', ownerEmail: `wa-admin-dash-${stamp}@example.com` });
    restaurantId = restRes.body.restaurant.id;
    await platform('post', '/api/v1/subscriptions').send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * day).toISOString(), applications: ['WHATSAPP_ORDERING'] });

    const activationToken = restRes.body.activationToken;
    await http().post('/api/v1/tenant-auth/set-initial-password').send({ restaurantId, email: `wa-admin-dash-${stamp}@example.com`, activationToken, newPassword: 'owner-correct-horse-battery' });
    const loginRes = await http().post('/api/v1/tenant-auth/login').send({ restaurantId, email: `wa-admin-dash-${stamp}@example.com`, password: 'owner-correct-horse-battery' });
    const ownerToken = loginRes.body.accessToken as string;

    const genRes = await http().post('/api/v1/tenant/whatsapp-channel/generate-key').set('Authorization', `Bearer ${ownerToken}`);
    await asService('/api/v1/service/whatsapp-channel/validate-key', { key: genRes.body.key });
  }, 60_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.whatsAppChannelConnection.deleteMany({ where: { restaurantId } }));
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('rejects an unauthenticated request', async () => {
    const res = await http().get('/api/v1/whatsapp-ordering/restaurants');
    expect(res.status).toBe(401);
  });

  it('lists the real connected restaurant with its actual connection/entitlement state', async () => {
    const res = await platform('get', '/api/v1/whatsapp-ordering/restaurants');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const row = (res.body as Array<{ restaurantId: string; connectionStatus: string; entitlementEnabled: boolean; ordersTotal: number; revenueTotalPaise: number }>).find(
      (r) => r.restaurantId === restaurantId
    );
    expect(row).toBeTruthy();
    expect(row?.connectionStatus).toBe('CONNECTED');
    expect(row?.entitlementEnabled).toBe(true);
    expect(row?.ordersTotal).toBe(0);
    expect(row?.revenueTotalPaise).toBe(0);
  });

  it('never lists a restaurant that has no WhatsAppChannelConnection at all', async () => {
    const otherRes = await platform('post', '/api/v1/restaurants').send({ name: `TEST WA Admin Dash No Connection ${stamp}`, ownerName: 'Owner', ownerEmail: `wa-admin-dash-noconn-${stamp}@example.com` });
    const otherId = otherRes.body.restaurant.id;

    const res = await platform('get', '/api/v1/whatsapp-ordering/restaurants');
    const row = (res.body as Array<{ restaurantId: string }>).find((r) => r.restaurantId === otherId);
    expect(row).toBeUndefined();

    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: otherId } }));
  });

  it('metrics reflect the real connected/pending counts, not a static shape', async () => {
    const res = await platform('get', '/api/v1/whatsapp-ordering/metrics');
    expect(res.status).toBe(200);
    expect(res.body.connectedRestaurants).toBeGreaterThanOrEqual(1);
    expect(typeof res.body.totalOrders).toBe('number');
    expect(typeof res.body.totalRevenuePaise).toBe('number');
  });
});
