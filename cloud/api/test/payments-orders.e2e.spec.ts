import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { CashfreeGatewayService } from '../src/modules/payments/cashfree-gateway.service';

describe('Payment order creation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-pay-orders-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  let kioskToken: string;

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  const thali = {
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

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(CashfreeGatewayService).useValue({
        isConfigured: () => true,
        createOrder: vi.fn().mockResolvedValue({ cfOrderId: 'cf_1', orderId: 'pay_mock', paymentSessionId: 'session_mock', orderStatus: 'ACTIVE' })
      })
    );
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email: adminEmail, password: adminPassword });
    platformToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Pay Orders Restaurant ${Date.now()}`,
      ownerName: 'Pay Orders Owner',
      ownerEmail: `pay-orders-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;

    const planRes = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO', name: `TEST Pay Orders Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { kiosk: true }
    });
    planId = planRes.body.id;
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });

    const keyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'KIOSK', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const redeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: keyRes.body.code, deviceType: 'KIOSK' });
    kioskToken = redeemRes.body.deviceToken;

    await authed('post', '/api/v1/tenant/menu-sync', kioskToken).send({ items: [thali] }).catch(() => {});
    // menu-sync requires a KIOSK_ADMIN device — seed the snapshot directly instead.
    await prisma.runAsTenant(restaurantId, (tx) =>
      tx.menuSnapshotItem.upsert({
        where: { restaurantId_externalItemId: { restaurantId, externalItemId: 'thali-1' } },
        create: { restaurantId, ...thali },
        update: { ...thali }
      })
    );
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  const validLines = [{ externalItemId: 'thali-1', quantity: 2, selectedOptionIds: ['extra-hot'] }];

  it('rejects order creation when no RestaurantPaymentConnection is ACTIVE', async () => {
    const res = await authed('post', '/api/v1/payments/orders', kioskToken).send({ externalOrderId: 'local-order-1', lines: validLines });
    expect(res.status).toBe(403);
  });

  it('creates an order + payment with a backend-computed total once the connection is ACTIVE', async () => {
    await prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.create({ data: { restaurantId, status: 'ACTIVE' } }));

    const res = await authed('post', '/api/v1/payments/orders', kioskToken).send({ externalOrderId: 'local-order-2', lines: validLines });
    expect(res.status).toBe(201);
    // (26000 base+modifier) * 2 qty = 52000 subtotal, 5% tax = 2600 -> 54600 total
    expect(res.body.amount).toBe(54600);
    expect(res.body.currency).toBe('INR');
    expect(res.body.paymentSessionId).toBe('session_mock');
    expect(res.body.status).toBe('PENDING');

    const order = await prisma.runAsPlatform((tx) => tx.order.findUniqueOrThrow({ where: { id: res.body.orderId } }));
    expect(order.totalAmount).toBe(54600);
    expect(order.status).toBe('PENDING_PAYMENT');
  });

  it('is idempotent: retrying the same externalOrderId returns the same payment instead of creating a new one', async () => {
    const first = await authed('post', '/api/v1/payments/orders', kioskToken).send({ externalOrderId: 'local-order-3', lines: validLines });
    const second = await authed('post', '/api/v1/payments/orders', kioskToken).send({ externalOrderId: 'local-order-3', lines: validLines });
    expect(second.body.paymentId).toBe(first.body.paymentId);
    expect(second.body.orderId).toBe(first.body.orderId);

    const payments = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findMany({ where: { orderId: first.body.orderId } }));
    expect(payments.length).toBe(1);
  });

  it('rejects a cart referencing an unknown menu item', async () => {
    const res = await authed('post', '/api/v1/payments/orders', kioskToken).send({
      externalOrderId: 'local-order-4',
      lines: [{ externalItemId: 'does-not-exist', quantity: 1, selectedOptionIds: [] }]
    });
    expect(res.status).toBe(400);
  });

  it('never accepts a client-supplied amount field (there is no such field in the schema, so a tampered client is structurally unable to influence total)', async () => {
    const res = await authed('post', '/api/v1/payments/orders', kioskToken).send({
      externalOrderId: 'local-order-5',
      lines: validLines,
      amount: 1 // extra field, ignored by Zod's default stripping behavior
    });
    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(54600);
  });

  it('returns the correct status shape for the owning kiosk', async () => {
    const create = await authed('post', '/api/v1/payments/orders', kioskToken).send({ externalOrderId: 'local-order-6', lines: validLines });
    const res = await authed('get', `/api/v1/payments/${create.body.paymentId}/status`, kioskToken);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      paymentId: create.body.paymentId,
      orderId: create.body.orderId,
      status: 'PENDING',
      amount: 54600,
      currency: 'INR',
      orderStatus: 'PENDING_PAYMENT'
    });
  });

  it('a device from another restaurant cannot read this payment status', async () => {
    const otherOwnerEmail = `pay-orders-other-owner-${Date.now()}@test.example.com`;
    const otherRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Other Pay Orders Restaurant ${Date.now()}`,
      ownerName: 'Other Owner',
      ownerEmail: otherOwnerEmail
    });
    const otherRestaurantId = otherRes.body.restaurant.id;
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId: otherRestaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
    const otherKeyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({
      restaurantId: otherRestaurantId, allowedDeviceType: 'KIOSK', expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    const otherRedeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: otherKeyRes.body.code, deviceType: 'KIOSK' });
    const otherKioskToken = otherRedeemRes.body.deviceToken;

    const create = await authed('post', '/api/v1/payments/orders', kioskToken).send({ externalOrderId: 'local-order-7', lines: validLines });
    const res = await authed('get', `/api/v1/payments/${create.body.paymentId}/status`, otherKioskToken);
    expect(res.status).toBe(404);

    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: otherRestaurantId } }));
  });

  it('an unknown paymentId returns 404', async () => {
    const res = await authed('get', '/api/v1/payments/00000000-0000-0000-0000-000000000000/status', kioskToken);
    expect(res.status).toBe(404);
  });
});
