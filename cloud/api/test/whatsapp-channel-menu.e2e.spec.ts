import { createHash, createHmac } from 'crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Jamanvaar ↔ WhatsApp connector, Phase 3: GET channels/menu. Reuses the exact
 * published-menu + live-sold-out + ETag machinery QR ordering already proved correct
 * (qr-ordering-saas.e2e.spec.ts) — this file proves the channel-specific parts: the
 * connection-status gate, the server-only field redaction, and the signed-request wiring.
 */
describe('Jamanvaar WhatsApp connector — channels/menu', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-wa-menu-admin-${stamp}@example.com`;
  const SERVICE_SECRET = 'test-jamanvaar-service-secret-for-menu-e2e';
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  const day = 86400_000;

  const http = () => request(app.getHttpServer());
  const platform = (method: 'get' | 'post', url: string) => http()[method](url).set('Authorization', `Bearer ${platformToken}`);
  const as = (method: 'get' | 'post', url: string, token: string) => http()[method](url).set('Authorization', `Bearer ${token}`);
  const push = (token: string, type: string, externalId: string, payload: Record<string, unknown>) =>
    as('post', `/api/v1/entity-sync/${type}`, token).send({ events: [{ externalId, payload: { id: externalId, ...payload, updatedAt: new Date().toISOString() } }] });

  function signed(method: string, path: string, body: unknown = {}) {
    const timestamp = String(Date.now());
    const bodyHash = createHash('sha256').update(JSON.stringify(body ?? {})).digest('hex');
    const signature = createHmac('sha256', SERVICE_SECRET).update(`${method.toUpperCase()}\n${path}\n${timestamp}\n${bodyHash}`).digest('hex');
    return { signature, timestamp };
  }
  const asService = (path: string) => {
    const { signature, timestamp } = signed('GET', path);
    return http().get(path).set('x-signature', signature).set('x-timestamp', timestamp);
  };

  beforeAll(async () => {
    process.env.JAMANVAAR_SERVICE_SECRET = SERVICE_SECRET;
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;

    planId = (await platform('post', '/api/v1/plans').send({ tier: 'PRO', name: `TEST WA Menu Plan ${stamp}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { posTerminal: true } })).body.id;
    const restRes = await platform('post', '/api/v1/restaurants').send({ name: `TEST WA Menu ${stamp}`, ownerName: 'Owner', ownerEmail: `wa-menu-${stamp}@example.com` });
    restaurantId = restRes.body.restaurant.id;
    // Phase 6: channels/menu now gates on the real WHATSAPP_ORDERING entitlement too (see
    // WhatsAppChannelService.requireEntitled) -- explicit `applications` grants it directly
    // alongside the POS_ADMIN this file's own device-redemption step below still needs
    // (replacing, not adding to, RESTAURANT:PRO's own tier defaults).
    await platform('post', '/api/v1/subscriptions').send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * day).toISOString(), applications: ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'WHATSAPP_ORDERING'] });

    const keyRes = await platform('post', '/api/v1/activation-keys').send({ restaurantId, allowedDeviceType: 'POS_ADMIN', expiresAt: new Date(Date.now() + day).toISOString() });
    const redeemRes = await http().post('/api/v1/activation/redeem').send({ code: keyRes.body.code, deviceType: 'POS_ADMIN' });
    const console_ = redeemRes.body.deviceToken as string;

    await push(console_, 'MENU_CATEGORY', 'cat-wa', { name: 'Mains', isActive: true, sortOrder: 1 });
    await push(console_, 'MENU_ITEM', 'pizza-wa', { categoryId: 'cat-wa', name: 'Paneer Pizza', price: 249, isAvailable: true });
    await push(console_, 'MENU_ITEM', 'soldout-wa', { categoryId: 'cat-wa', name: 'Sold Out Dish', price: 99, isAvailable: false });
    await as('post', '/api/v1/menu/publish', console_).send({});

    // Directly mark the connection CONNECTED -- the connect flow itself (validate-key) is
    // covered by whatsapp-channel.e2e.spec.ts; this file only needs a connected restaurant
    // to exist so channels/menu's own gate and logic can be proven.
    await prisma.runAsTenant(restaurantId, (tx) =>
      tx.whatsAppChannelConnection.create({
        data: { restaurantId, keyPrefix: 'jmn_live_test', keyHash: `hash-${stamp}`, status: 'CONNECTED', connectedAt: new Date() }
      })
    );
  }, 120_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.whatsAppChannelConnection.deleteMany({ where: { restaurantId } }));
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('returns the published menu, live-excludes the sold-out item, and never includes lookup/stations', async () => {
    const path = `/api/v1/service/whatsapp-channel/channels/menu?restaurantId=${restaurantId}`;
    const res = await asService(path);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.ready).toBe(true);
    const names = res.body.items.map((i: { name: string }) => i.name);
    expect(names).toContain('Paneer Pizza');
    expect(names).not.toContain('Sold Out Dish');
    expect(res.body).not.toHaveProperty('lookup');
    expect(res.body).not.toHaveProperty('stations');
    expect(res.body.categories.map((c: { name: string }) => c.name)).toContain('Mains');
  });

  it('supports ETag/304, same contract as QR ordering', async () => {
    const path = `/api/v1/service/whatsapp-channel/channels/menu?restaurantId=${restaurantId}`;
    const first = await asService(path);
    const etag = first.headers.etag;
    expect(etag).toBeTruthy();

    const { signature, timestamp } = signed('GET', path);
    const second = await http().get(path).set('x-signature', signature).set('x-timestamp', timestamp).set('if-none-match', etag);
    expect(second.status).toBe(304);
  });

  it('refuses a restaurant that has never connected', async () => {
    const other = await platform('post', '/api/v1/restaurants').send({ name: `TEST WA Menu Unconnected ${stamp}`, ownerName: 'Owner', ownerEmail: `wa-menu-unconnected-${stamp}@example.com` });
    const otherId = other.body.restaurant.id;
    const path = `/api/v1/service/whatsapp-channel/channels/menu?restaurantId=${otherId}`;
    const res = await asService(path);
    expect(res.status).toBe(404);
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: otherId } }));
  });

  it('refuses a revoked connection', async () => {
    await prisma.runAsTenant(restaurantId, (tx) => tx.whatsAppChannelConnection.update({ where: { restaurantId }, data: { status: 'REVOKED' } }));
    const path = `/api/v1/service/whatsapp-channel/channels/menu?restaurantId=${restaurantId}`;
    const res = await asService(path);
    expect(res.status).toBe(404);
    // restore for any later test in this file
    await prisma.runAsTenant(restaurantId, (tx) => tx.whatsAppChannelConnection.update({ where: { restaurantId }, data: { status: 'CONNECTED' } }));
  });

  it('rejects an unsigned request', async () => {
    const res = await http().get(`/api/v1/service/whatsapp-channel/channels/menu?restaurantId=${restaurantId}`);
    expect(res.status).toBe(401);
  });
});
