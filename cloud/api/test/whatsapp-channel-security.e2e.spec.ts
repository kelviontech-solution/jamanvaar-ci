import { createHash, createHmac } from 'crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Jamanvaar WhatsApp connector, Phase 7 (security hardening — see
 * docs/integrations/JAMANVAAR_WHATSAPP_CONNECTOR_IMPLEMENTATION_PLAN.md). The plan's own
 * verification step for this phase is "re-run the B2-029 (cross-tenant leak) and B2-051
 * (RBAC leak) scenarios against the new endpoints" — this file is that re-run, plus the
 * new per-restaurant / per-customer-phone rate limiting this phase added
 * (whatsapp-channel.service.controller.ts's @Throttle(...) trackers).
 */
describe('Jamanvaar WhatsApp connector — Phase 7 security hardening', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-wa-sec-admin-${stamp}@example.com`;
  const SERVICE_SECRET = 'test-jamanvaar-service-secret-for-security-e2e';
  let platformToken: string;
  let planId: string;
  const day = 86400_000;

  const http = () => request(app.getHttpServer());
  const platform = (method: 'get' | 'post', url: string) => http()[method](url).set('Authorization', `Bearer ${platformToken}`);
  const as = (method: 'get' | 'post', url: string, token: string) => http()[method](url).set('Authorization', `Bearer ${token}`);
  const push = (token: string, type: string, externalId: string, payload: Record<string, unknown>) =>
    as('post', `/api/v1/entity-sync/${type}`, token).send({ events: [{ externalId, payload: { id: externalId, ...payload, updatedAt: new Date().toISOString() } }] });

  function signed(method: string, path: string, body: unknown = {}) {
    const timestamp = String(Date.now());
    const raw = JSON.stringify(body ?? {});
    const bodyHash = createHash('sha256').update(raw).digest('hex');
    const signature = createHmac('sha256', SERVICE_SECRET).update(`${method.toUpperCase()}\n${path}\n${timestamp}\n${bodyHash}`).digest('hex');
    return { headers: { 'x-signature': signature, 'x-timestamp': timestamp }, raw };
  }
  const asService = (method: 'get' | 'post', path: string, body: unknown = {}) => {
    const { headers, raw } = signed(method, path, body);
    const req = http()[method](path).set('x-signature', headers['x-signature']).set('x-timestamp', headers['x-timestamp']).set('content-type', 'application/json');
    return method === 'post' ? req.send(raw) : req;
  };

  /** One connected restaurant with one published, named menu item -- same shortcut
   *  whatsapp-channel-menu.e2e.spec.ts uses (directly marking the connection CONNECTED;
   *  validate-key itself is proven elsewhere). */
  async function newConnectedRestaurant(label: string, itemId: string, itemName: string) {
    const restRes = await platform('post', '/api/v1/restaurants').send({ name: `TEST WA Security ${label} ${stamp}`, ownerName: 'Owner', ownerEmail: `wa-sec-${label}-${stamp}@example.com` });
    const restaurantId = restRes.body.restaurant.id;
    await platform('post', '/api/v1/subscriptions').send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * day).toISOString(), applications: ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'WHATSAPP_ORDERING'] });

    const keyRes = await platform('post', '/api/v1/activation-keys').send({ restaurantId, allowedDeviceType: 'POS_ADMIN', expiresAt: new Date(Date.now() + day).toISOString() });
    const redeemRes = await http().post('/api/v1/activation/redeem').send({ code: keyRes.body.code, deviceType: 'POS_ADMIN' });
    const console_ = redeemRes.body.deviceToken as string;

    await push(console_, 'MENU_CATEGORY', `cat-${itemId}`, { name: 'Mains', isActive: true, sortOrder: 1 });
    await push(console_, 'MENU_ITEM', itemId, { categoryId: `cat-${itemId}`, name: itemName, price: 199, isAvailable: true });
    await as('post', '/api/v1/menu/publish', console_).send({});

    await prisma.runAsTenant(restaurantId, (tx) =>
      tx.whatsAppChannelConnection.create({ data: { restaurantId, keyPrefix: 'jmn_live_test', keyHash: `hash-${label}-${stamp}`, status: 'CONNECTED', connectedAt: new Date() } })
    );
    const branch = await prisma.runAsTenant(restaurantId, (tx) => tx.branch.findFirstOrThrow({ where: { restaurantId } }));
    return { restaurantId, branchId: branch.id };
  }

  let restaurantA: { restaurantId: string; branchId: string };
  let restaurantB: { restaurantId: string; branchId: string };

  beforeAll(async () => {
    process.env.JAMANVAAR_SERVICE_SECRET = SERVICE_SECRET;
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;
    planId = (await platform('post', '/api/v1/plans').send({ tier: 'PRO', name: `TEST WA Security Plan ${stamp}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { posTerminal: true } })).body.id;

    restaurantA = await newConnectedRestaurant('a', `pizza-a-${stamp}`, 'Restaurant A Pizza');
    restaurantB = await newConnectedRestaurant('b', `pizza-b-${stamp}`, 'Restaurant B Pizza');
  }, 120_000);

  afterAll(async () => {
    for (const r of [restaurantA, restaurantB]) {
      await prisma.runAsPlatform((tx) => tx.whatsAppChannelConnection.deleteMany({ where: { restaurantId: r.restaurantId } })).catch(() => undefined);
      await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: r.restaurantId } })).catch(() => undefined);
    }
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  describe('cross-tenant isolation (B2-029 re-run)', () => {
    it("channels/menu for restaurant A never includes restaurant B's items, and vice versa", async () => {
      const menuA = await asService('get', `/api/v1/service/whatsapp-channel/channels/menu?restaurantId=${restaurantA.restaurantId}`);
      const menuB = await asService('get', `/api/v1/service/whatsapp-channel/channels/menu?restaurantId=${restaurantB.restaurantId}`);
      const namesA = menuA.body.items.map((i: { name: string }) => i.name);
      const namesB = menuB.body.items.map((i: { name: string }) => i.name);
      expect(namesA).toContain('Restaurant A Pizza');
      expect(namesA).not.toContain('Restaurant B Pizza');
      expect(namesB).toContain('Restaurant B Pizza');
      expect(namesB).not.toContain('Restaurant A Pizza');
    });

    it("quoting restaurant B's cart with restaurant A's itemId fails closed instead of pricing a cross-tenant item", async () => {
      const res = await asService('post', `/api/v1/service/whatsapp-channel/channels/quote?restaurantId=${restaurantB.restaurantId}`, {
        branchId: restaurantB.branchId,
        cart: [{ itemId: `pizza-a-${stamp}`, quantity: 1, optionIds: [] }]
      });
      expect(res.status, JSON.stringify(res.body)).toBe(400);
    });

    it("an order belonging to restaurant A cannot be fetched by passing restaurant B's restaurantId instead", async () => {
      const order = await prisma.runAsTenant(restaurantA.restaurantId, (tx) =>
        tx.order.create({ data: { restaurantId: restaurantA.restaurantId, externalOrderId: `wa_cross_tenant_${stamp}`, source: 'WHATSAPP', items: [], subtotal: 0, taxAmount: 0, totalAmount: 0 } })
      );
      const wrongTenant = await asService('get', `/api/v1/service/whatsapp-channel/channels/orders/${order.id}?restaurantId=${restaurantB.restaurantId}`);
      expect(wrongTenant.status).toBe(404);
      const rightTenant = await asService('get', `/api/v1/service/whatsapp-channel/channels/orders/${order.id}?restaurantId=${restaurantA.restaurantId}`);
      expect(rightTenant.status).toBe(200);
      expect(rightTenant.body.orderId).toBe(order.id);
    });
  });

  describe('rate limiting', () => {
    it('limits repeated checkout attempts for the same restaurant+customer phone, independently of other customers', async () => {
      const cart = [{ itemId: `pizza-a-${stamp}`, quantity: 1, optionIds: [] }];
      const checkoutFor = (phone: string, n: number) =>
        asService('post', `/api/v1/service/whatsapp-channel/channels/checkout?restaurantId=${restaurantA.restaurantId}`, {
          branchId: restaurantA.branchId,
          cart,
          idempotencyKey: `rl-${phone}-${n}-${stamp}`,
          customer: { name: 'Rate Limit Test', phone },
          orderType: 'PICKUP',
          externalOrderId: `rl-${phone}-${n}-${stamp}`
        });

      const phoneX = '9000000001';
      const results: number[] = [];
      // The per-customer limiter (whatsappCheckoutPerCustomer) is 5 per 10 minutes -- the
      // 6th call for the SAME restaurant+phone must be refused with 429, regardless of what
      // the first 5 actually returned (none of these restaurants have an active payment
      // connection, so a non-429 response here is a 403 "payments not active", not a 200 --
      // that's fine, the throttle guard runs before the handler either way).
      for (let i = 1; i <= 6; i++) {
        const res = await checkoutFor(phoneX, i);
        results.push(res.status);
      }
      expect(results.slice(0, 5), JSON.stringify(results)).not.toContain(429);
      expect(results[5]).toBe(429);

      // A different customer phone, same restaurant, right after the above: must NOT be
      // limited by phoneX's exhausted bucket -- proves the tracker is keyed per-phone, not
      // just per-restaurant (which already has its own separate, looser 20/min cap).
      const otherCustomer = await checkoutFor('9000000002', 1);
      expect(otherCustomer.status).not.toBe(429);
    }, 30_000);
  });
});
