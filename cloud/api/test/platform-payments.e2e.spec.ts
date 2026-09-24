import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { CashfreeGatewayService } from '../src/modules/payments/cashfree-gateway.service';

describe('Platform payments visibility', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-platpay-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let posToken: string;

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(CashfreeGatewayService).useValue({
        isConfigured: () => true,
        createRefund: vi.fn().mockResolvedValue({ cfRefundId: 'cf_refund_mock', refundId: 'refund_mock', refundStatus: 'PENDING', refundAmount: 100 })
      })
    );
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await platformLogin(app, adminEmail, adminPassword);
    platformToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Platform Payments Restaurant ${Date.now()}`, ownerName: 'Platpay Owner', ownerEmail: `platpay-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;

    const planRes = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO', name: `TEST Platpay Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { kiosk: true }
    });
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId, planId: planRes.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });

    const posKeyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const posRedeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: posKeyRes.body.code, deviceType: 'POS' });
    posToken = posRedeemRes.body.deviceToken;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  const seedPayment = async (amount: number, status: 'SUCCESS' | 'FAILED') => {
    const order = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({ data: { restaurantId, externalOrderId: `platpay-test-${Date.now()}-${Math.random()}`, items: [], subtotal: amount, taxAmount: 0, totalAmount: amount, status: status === 'SUCCESS' ? 'PAID' : 'PAYMENT_FAILED' } })
    );
    const payment = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({ data: { orderId: order.id, restaurantId, providerOrderId: `pay_${Date.now()}_${Math.random()}`, amount, currency: 'INR', status } })
    );
    return payment.id;
  };

  it('lists payments for a restaurant in { rows, total, page, limit } shape', async () => {
    await seedPayment(10000, 'SUCCESS');
    const res = await authed('get', `/api/v1/payments?restaurantId=${restaurantId}`, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(25);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body.rows[0].order).toBeDefined();
  });

  it('filters by status', async () => {
    await seedPayment(5000, 'FAILED');
    const res = await authed('get', `/api/v1/payments?restaurantId=${restaurantId}&status=FAILED`, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.rows.every((r: { status: string }) => r.status === 'FAILED')).toBe(true);
    expect(res.body.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('paginates with page/limit', async () => {
    for (let i = 0; i < 3; i++) await seedPayment(1000 + i, 'SUCCESS');
    const page1 = await authed('get', `/api/v1/payments?restaurantId=${restaurantId}&page=1&limit=2`, platformToken);
    expect(page1.body.rows.length).toBe(2);
    const page2 = await authed('get', `/api/v1/payments?restaurantId=${restaurantId}&page=2&limit=2`, platformToken);
    expect(page2.body.rows.length).toBeGreaterThanOrEqual(1);
    expect(page1.body.rows[0].id).not.toBe(page2.body.rows[0].id);
  });

  it('includes refunds on a payment that has one', async () => {
    const paymentId = await seedPayment(10000, 'SUCCESS');
    await authed('post', `/api/v1/payments/${paymentId}/refund`, posToken).send({ amountPaise: 4000, reason: 'Partial refund for visibility test', requestedBy: 'Test Manager' });

    const res = await authed('get', `/api/v1/payments?restaurantId=${restaurantId}`, platformToken);
    const row = res.body.rows.find((r: { id: string }) => r.id === paymentId);
    expect(row.refunds.length).toBe(1);
    expect(row.refunds[0].amount).toBe(4000);
    expect(row.status).toBe('REFUND_PENDING');
  });

  it('detail endpoint returns order and refunds', async () => {
    const paymentId = await seedPayment(7000, 'SUCCESS');
    const res = await authed('get', `/api/v1/payments/${paymentId}`, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.order.totalAmount).toBe(7000);
    expect(Array.isArray(res.body.refunds)).toBe(true);
  });

  it('detail endpoint 404s for an unknown id', async () => {
    const res = await authed('get', '/api/v1/payments/00000000-0000-0000-0000-000000000000', platformToken);
    expect(res.status).toBe(404);
  });

  it('a device token (not platform) is rejected', async () => {
    const res = await authed('get', `/api/v1/payments?restaurantId=${restaurantId}`, posToken);
    expect(res.status).toBe(401);
  });
});
