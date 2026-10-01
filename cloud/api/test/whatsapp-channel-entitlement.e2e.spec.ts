import { createHash, createHmac } from 'crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Jamanvaar WhatsApp connector, Phase 6: the WHATSAPP_ORDERING entitlement actually blocks
 * every endpoint server-side when it's off -- not just a UI affordance. Mirrors QR
 * ordering's own entitlement test coverage (qr-ordering.e2e.spec.ts) closely: a restaurant
 * with no subscription, one whose plan doesn't include it, and one where a Super Admin
 * explicitly disabled it after it was on, all refused the same way; one where it's on
 * works normally; and the DEVICE_BACKED_APP_CODES fix (disabling a channel entitlement
 * that has no real Device type must not crash) is proven directly against the real
 * Super Admin toggle endpoint, not just inferred.
 */
describe('Jamanvaar WhatsApp connector — WHATSAPP_ORDERING entitlement', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-wa-entitlement-admin-${stamp}@example.com`;
  const SERVICE_SECRET = 'test-jamanvaar-service-secret-for-entitlement-e2e';
  let platformToken: string;
  let planId: string;
  const day = 86400_000;

  const http = () => request(app.getHttpServer());
  const platform = (method: 'get' | 'post' | 'patch', url: string) => http()[method](url).set('Authorization', `Bearer ${platformToken}`);

  function signedService(method: string, path: string, body: unknown = {}) {
    const timestamp = String(Date.now());
    const raw = JSON.stringify(body ?? {});
    const bodyHash = createHash('sha256').update(raw).digest('hex');
    const signature = createHmac('sha256', SERVICE_SECRET).update(`${method.toUpperCase()}\n${path}\n${timestamp}\n${bodyHash}`).digest('hex');
    return { headers: { 'x-signature': signature, 'x-timestamp': timestamp }, raw };
  }
  const asService = (method: 'get' | 'post', path: string, body: unknown = {}) => {
    const { headers, raw } = signedService(method, path, body);
    const req = http()[method](path).set('x-signature', headers['x-signature']).set('x-timestamp', headers['x-timestamp']).set('content-type', 'application/json');
    return method === 'post' ? req.send(raw) : req;
  };

  const createdRestaurantIds: string[] = [];
  async function newOwner(name: string, applications?: string[]) {
    const restRes = await platform('post', '/api/v1/restaurants').send({ name: `TEST WA Entitlement ${name} ${stamp}`, ownerName: 'Owner', ownerEmail: `wa-ent-${name}-${stamp}@example.com` });
    const restaurantId = restRes.body.restaurant.id;
    createdRestaurantIds.push(restaurantId);
    const activationToken = restRes.body.activationToken;
    await http().post('/api/v1/tenant-auth/set-initial-password').send({ restaurantId, email: `wa-ent-${name}-${stamp}@example.com`, activationToken, newPassword: 'owner-correct-horse-battery' });
    const loginRes = await http().post('/api/v1/tenant-auth/login').send({ restaurantId, email: `wa-ent-${name}-${stamp}@example.com`, password: 'owner-correct-horse-battery' });
    let subscriptionId: string | null = null;
    if (applications) {
      const subRes = await platform('post', '/api/v1/subscriptions').send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * day).toISOString(), applications });
      subscriptionId = subRes.body.id;
    }
    return { restaurantId, ownerToken: loginRes.body.accessToken as string, subscriptionId };
  }

  beforeAll(async () => {
    process.env.JAMANVAAR_SERVICE_SECRET = SERVICE_SECRET;
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;

    planId = (await platform('post', '/api/v1/plans').send({ tier: 'PRO', name: `TEST WA Entitlement Plan ${stamp}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: {} })).body.id;
  }, 60_000);

  afterAll(async () => {
    await prisma.platformDb.platformNotification.deleteMany({ where: { type: 'WHATSAPP_CONNECTION_LOCKED', restaurantId: { in: createdRestaurantIds } } }).catch(() => undefined);
    await prisma.runAsPlatform((tx) => tx.whatsAppChannelConnection.deleteMany({ where: { restaurant: { name: { contains: `TEST WA Entitlement` } } } })).catch(() => undefined);
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { name: { contains: `TEST WA Entitlement ` } } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('a restaurant with no subscription at all is refused with ENTITLEMENT_REQUIRED on generate-key', async () => {
    const { ownerToken } = await newOwner('no-sub');
    const res = await http().post('/api/v1/tenant/whatsapp-channel/generate-key').set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ENTITLEMENT_REQUIRED');
    expect(res.body.reason).toBe('NO_SUBSCRIPTION');
  });

  it("a restaurant whose plan doesn't include WHATSAPP_ORDERING is refused the same way", async () => {
    const { ownerToken } = await newOwner('not-included', ['POS', 'POS_ADMIN']);
    const res = await http().post('/api/v1/tenant/whatsapp-channel/generate-key').set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ENTITLEMENT_REQUIRED');
    expect(res.body.reason).toBe('NOT_INCLUDED');
  });

  it('entitlement() reports locked with a real message for a restaurant that lacks it', async () => {
    const { ownerToken } = await newOwner('locked-status', ['POS']);
    const res = await http().get('/api/v1/tenant/whatsapp-channel/entitlement').set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
    expect(res.body.lockedMessage).toContain('WhatsApp Ordering');
  });

  it('a restaurant WITH the entitlement can generate a key, update settings, and validate-key connects it', async () => {
    const { restaurantId, ownerToken } = await newOwner('enabled', ['POS', 'WHATSAPP_ORDERING']);

    const entRes = await http().get('/api/v1/tenant/whatsapp-channel/entitlement').set('Authorization', `Bearer ${ownerToken}`);
    expect(entRes.body.enabled).toBe(true);
    expect(entRes.body.lockedMessage).toBeNull();

    const genRes = await http().post('/api/v1/tenant/whatsapp-channel/generate-key').set('Authorization', `Bearer ${ownerToken}`);
    expect(genRes.status, JSON.stringify(genRes.body)).toBe(201);

    const settingsRes = await http().patch('/api/v1/tenant/whatsapp-channel/settings').set('Authorization', `Bearer ${ownerToken}`).send({ autoAccept: true });
    expect(settingsRes.status).toBe(200);

    const validateRes = await asService('post', '/api/v1/service/whatsapp-channel/validate-key', { key: genRes.body.key });
    expect(validateRes.status, JSON.stringify(validateRes.body)).toBe(201);
    expect(validateRes.body.restaurantId).toBe(restaurantId);
  });

  it('a Super Admin disabling WHATSAPP_ORDERING after it was connected immediately locks channels/menu, without crashing (DEVICE_BACKED_APP_CODES fix)', async () => {
    const { restaurantId, ownerToken, subscriptionId } = await newOwner('downgrade', ['POS', 'WHATSAPP_ORDERING']);
    const genRes = await http().post('/api/v1/tenant/whatsapp-channel/generate-key').set('Authorization', `Bearer ${ownerToken}`);
    await asService('post', '/api/v1/service/whatsapp-channel/validate-key', { key: genRes.body.key });

    const menuPath = `/api/v1/service/whatsapp-channel/channels/menu?restaurantId=${restaurantId}`;
    const beforeDowngrade = await asService('get', menuPath);
    expect(beforeDowngrade.status, JSON.stringify(beforeDowngrade.body)).toBe(200);

    // The exact real Super Admin toggle endpoint (SubscriptionApplicationsController) --
    // before the DEVICE_BACKED_APP_CODES fix, this threw an unhandled 500
    // ("Invalid value for argument type. Expected DeviceType.") instead of a clean 200,
    // for WHATSAPP_ORDERING exactly like it already did for QR_ORDERING.
    const toggleRes = await platform('patch', `/api/v1/subscriptions/${subscriptionId}/applications/WHATSAPP_ORDERING`).send({ enabled: false });
    expect(toggleRes.status, JSON.stringify(toggleRes.body)).toBe(200);

    const afterDowngrade = await asService('get', menuPath);
    expect(afterDowngrade.status).toBe(403);
    expect(afterDowngrade.body.code).toBe('ENTITLEMENT_REQUIRED');

    // B2-055 anti-regression, applied to this connector: the lock takes effect immediately,
    // the same request pattern the browser would poll, not just on a fresh login/session.
    // reason is NOT_INCLUDED, not DISABLED: this test plan's own entitlements JSON never
    // granted whatsappOrdering (DISABLED specifically means the plan itself would include
    // it by default and a row explicitly turned it off — see resolve()'s own planDefault
    // check) — the manual override this test enabled it with is gone, same as it never
    // having existed, which is the correct, intended distinction, not a bug.
    const entRes = await http().get('/api/v1/tenant/whatsapp-channel/entitlement').set('Authorization', `Bearer ${ownerToken}`);
    expect(entRes.body.enabled).toBe(false);
    expect(entRes.body.reason).toBe('NOT_INCLUDED');

    // Phase 7: the blocked call above must have raised a real, queryable alert for the
    // platform team -- this restaurant IS connected, so this isn't an unconfigured
    // integration, it's a live one silently failing a real customer's order right now.
    const alert = await prisma.platformDb.platformNotification.findFirst({ where: { type: 'WHATSAPP_CONNECTION_LOCKED', restaurantId } });
    expect(alert, 'expected a WHATSAPP_CONNECTION_LOCKED alert for the now-locked, still-connected restaurant').toBeTruthy();
    expect(alert?.body).toContain('NOT_INCLUDED');
  });

  it('checkout and quote are also refused for a restaurant without the entitlement, even if otherwise connected', async () => {
    // Connect while entitled, then disable -- proves requireOrderable (checkout's own gate,
    // not just requireConnected/getMenu's) re-checks the entitlement too.
    const { restaurantId, ownerToken, subscriptionId } = await newOwner('checkout-locked', ['POS', 'WHATSAPP_ORDERING']);
    const genRes = await http().post('/api/v1/tenant/whatsapp-channel/generate-key').set('Authorization', `Bearer ${ownerToken}`);
    await asService('post', '/api/v1/service/whatsapp-channel/validate-key', { key: genRes.body.key });
    await platform('patch', `/api/v1/subscriptions/${subscriptionId}/applications/WHATSAPP_ORDERING`).send({ enabled: false });

    const quoteRes = await asService('post', `/api/v1/service/whatsapp-channel/channels/quote?restaurantId=${restaurantId}`, { branchId: '00000000-0000-0000-0000-000000000000', cart: [{ itemId: 'x', quantity: 1, optionIds: [] }] });
    expect(quoteRes.status).toBe(403);
    expect(quoteRes.body.code).toBe('ENTITLEMENT_REQUIRED');

    const checkoutRes = await asService('post', `/api/v1/service/whatsapp-channel/channels/checkout?restaurantId=${restaurantId}`, {
      branchId: '00000000-0000-0000-0000-000000000000', cart: [{ itemId: 'x', quantity: 1, optionIds: [] }], idempotencyKey: `locked-${stamp}`, customer: { name: 'X', phone: '9990000000' }, orderType: 'PICKUP', externalOrderId: `locked-${stamp}`
    });
    expect(checkoutRes.status).toBe(403);
    expect(checkoutRes.body.code).toBe('ENTITLEMENT_REQUIRED');
  });
});
