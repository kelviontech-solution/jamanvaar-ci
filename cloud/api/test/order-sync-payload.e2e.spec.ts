import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * BUG-022 / BUG-034 / BUG-035: the order-sync bridge must carry the real order
 * (order/token numbers, cashier, tender lines, payment status, modifiers,
 * station, notes) to every other device, and one malformed order in a batch
 * must never block the valid ones (it used to reject the whole request, so a
 * device retried the same failing batch forever with no visible error).
 */
describe('Order sync payload fidelity and per-order validation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-order-payload-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  let posToken: string;
  let adminDeviceToken: string;

  const authed = (method: 'get' | 'post' | 'patch', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    const login = await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email: adminEmail, password: adminPassword });
    platformToken = login.body.accessToken;

    const rest = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Order Payload ${Date.now()}`,
      ownerName: 'Payload Owner',
      ownerEmail: `order-payload-owner-${Date.now()}@test.example.com`
    });
    restaurantId = rest.body.restaurant.id;
    const plan = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO', name: `TEST Payload Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { pos: true, kds: true }
    });
    planId = plan.body.id;
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString()
    });

    const mk = async (type: string) => {
      const key = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: type, expiresAt: new Date(Date.now() + 86400000).toISOString() });
      const redeem = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: type });
      return redeem.body.deviceToken as string;
    };
    posToken = await mk('POS');
    adminDeviceToken = await mk('POS_ADMIN');
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  const fullEvent = (id: string) => ({
    externalOrderId: id,
    orderType: 'DINE_IN',
    status: 'COMPLETED',
    tableId: 'tbl-4',
    tableLabel: '4',
    items: [
      {
        externalItemId: 'oi-1',
        menuItemId: 'item-pt',
        name: 'Paneer Tikka',
        quantity: 2,
        unitPrice: 26000,
        modifiers: ['Extra Cheese'],
        modifierDetails: [{ optionName: 'Extra Cheese', priceDelta: 2000 }],
        kitchenStatus: 'READY',
        kitchenStation: 'Tandoor',
        specialInstructions: 'no onion please',
        lineTotal: 52000
      }
    ],
    subtotal: 52000,
    taxAmount: 2600,
    discountAmount: 0,
    totalAmount: 54600,
    paymentStatus: 'SUCCESS',
    paymentMethod: 'SPLIT',
    meta: {
      orderNumber: 'ORD-1001',
      tokenNumber: '104',
      cashierName: 'Real Cashier',
      paymentSplits: [
        { method: 'CASH', amountPaise: 10000 },
        { method: 'UPI', amountPaise: 44600 }
      ],
      businessDayId: 'BD-20260919'
    },
    updatedAt: new Date().toISOString()
  });

  it('stores payment, tender lines and identity, and a Restaurant Admin device can pull them', async () => {
    const push = await authed('post', '/api/v1/orders/sync', posToken).send({ events: [fullEvent('payload-ord-1')] });
    expect(push.status).toBe(201);
    expect(push.body.results[0]).toMatchObject({ externalOrderId: 'payload-ord-1', status: 'ok' });

    const pull = await authed('get', '/api/v1/orders/sync', adminDeviceToken);
    expect(pull.status).toBe(200);
    const order = pull.body.orders.find((o: { externalOrderId: string }) => o.externalOrderId === 'payload-ord-1');
    expect(order).toBeTruthy();
    expect(order.paymentStatus).toBe('SUCCESS');
    expect(order.paymentMethod).toBe('SPLIT');
    expect(order.meta.orderNumber).toBe('ORD-1001');
    expect(order.meta.cashierName).toBe('Real Cashier');
    expect(order.meta.paymentSplits).toEqual([
      { method: 'CASH', amountPaise: 10000 },
      { method: 'UPI', amountPaise: 44600 }
    ]);
    expect(order.items[0].kitchenStation).toBe('Tandoor');
    expect(order.items[0].modifierDetails[0].optionName).toBe('Extra Cheese');
    expect(order.items[0].specialInstructions).toBe('no onion please');
  });

  it('one malformed order does not block the valid orders in the same batch', async () => {
    const good = fullEvent('payload-ord-good');
    const bad = { ...fullEvent('payload-ord-bad'), items: [] }; // an order with no items is invalid

    const push = await authed('post', '/api/v1/orders/sync', posToken).send({ events: [bad, good] });

    expect(push.status).toBe(201);
    const byId = Object.fromEntries(push.body.results.map((r: { externalOrderId: string }) => [r.externalOrderId, r]));
    expect(byId['payload-ord-good'].status).toBe('ok');
    expect(byId['payload-ord-bad'].status).toBe('error');
    expect(byId['payload-ord-bad'].error).toMatch(/Invalid order payload/);

    const pull = await authed('get', '/api/v1/orders/sync', adminDeviceToken);
    const ids = pull.body.orders.map((o: { externalOrderId: string }) => o.externalOrderId);
    expect(ids).toContain('payload-ord-good');
    expect(ids).not.toContain('payload-ord-bad');
  });
});
