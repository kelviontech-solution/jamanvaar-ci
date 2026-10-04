import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { RazorpayGatewayService } from '../src/modules/payments/razorpay-gateway.service';

describe('Platform payments visibility', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-platpay-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let posToken: string;

  const authed = (method: 'get' | 'post' | 'patch', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(RazorpayGatewayService).useValue({
        isConfigured: () => true,
        createRefund: vi.fn().mockResolvedValue({ refundId: 'rfnd_mock', status: 'pending', amountPaise: 100 })
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
      tier: 'PRO', name: `TEST Platpay Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { selfOrderKiosk: true }
    });
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId, planId: planRes.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });

    const posKeyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const posRedeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: posKeyRes.body.code, deviceType: 'POS' });
    posToken = posRedeemRes.body.deviceToken;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.platformSetting.deleteMany({ where: { key: 'PAYMENT_DEFAULT_COMMISSION_BPS' } }));
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  const seedPayment = async (amount: number, status: 'SUCCESS' | 'FAILED') => {
    const order = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({ data: { restaurantId, externalOrderId: `platpay-test-${Date.now()}-${Math.random()}`, items: [], subtotal: amount, taxAmount: 0, totalAmount: amount, status: status === 'SUCCESS' ? 'PAID' : 'PAYMENT_FAILED' } })
    );
    const payment = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({ data: { provider: 'RAZORPAY', providerPaymentId: `pay_rzp_${Date.now()}_${Math.random()}`, orderId: order.id, restaurantId, providerOrderId: `pay_${Date.now()}_${Math.random()}`, amount, currency: 'INR', status } })
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

  it('GET /commission-config defaults to 3% when never set', async () => {
    await prisma.runAsPlatform((tx) => tx.platformSetting.deleteMany({ where: { key: 'PAYMENT_DEFAULT_COMMISSION_BPS' } }));
    const res = await authed('get', '/api/v1/payments/commission-config', platformToken);
    expect(res.status).toBe(200);
    expect(res.body.defaultBps).toBe(300);
  });

  it("PATCH /commission-config refuses anything below 2% (Razorpay's fee comes out of the commission)", async () => {
    const res = await authed('patch', '/api/v1/payments/commission-config', platformToken).send({ defaultBps: 100, password: adminPassword });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least 2%/);
  });

  it('PATCH /commission-config sets the platform default and it is reflected on GET', async () => {
    const res = await authed('patch', '/api/v1/payments/commission-config', platformToken).send({ defaultBps: 250, password: adminPassword });
    expect(res.status).toBe(200);
    expect(res.body.defaultBps).toBe(250);

    const getRes = await authed('get', '/api/v1/payments/commission-config', platformToken);
    expect(getRes.body.defaultBps).toBe(250);
  });

  it('PATCH /commission-config rejects an out-of-range value', async () => {
    const tooHigh = await authed('patch', '/api/v1/payments/commission-config', platformToken).send({ defaultBps: 10001 });
    expect(tooHigh.status).toBe(400);
    const negative = await authed('patch', '/api/v1/payments/commission-config', platformToken).send({ defaultBps: -1 });
    expect(negative.status).toBe(400);
  });

  it('PATCH /commission-config records an audit log entry', async () => {
    await authed('patch', '/api/v1/payments/commission-config', platformToken).send({ defaultBps: 400, password: adminPassword });
    const entry = await prisma.runAsPlatform((tx) =>
      tx.auditLog.findFirst({ where: { action: 'COMMISSION_CHANGED', category: 'PAYMENTS' }, orderBy: { createdAt: 'desc' } })
    );
    expect(entry).not.toBeNull();
    expect((entry!.details as { scope?: string })?.scope).toBe('PLATFORM_DEFAULT');
  });

  it('a non-platform caller cannot read or change commission config', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/payments/commission-config');
    expect(res.status).toBe(401);
  });

  it('a FINANCE_ADMIN can read and write commission config (billing: write)', async () => {
    const email = `test-platpay-finance-${Date.now()}@example.com`;
    await createTestPlatformUser(prisma, { email, password: 'correct-horse-battery-staple', role: 'FINANCE_ADMIN' });
    const loginRes = await platformLogin(app, email, 'correct-horse-battery-staple');
    const token = loginRes.body.accessToken;

    const getRes = await authed('get', '/api/v1/payments/commission-config', token);
    expect(getRes.status).toBe(200);
    const patchRes = await authed('patch', '/api/v1/payments/commission-config', token).send({ defaultBps: 250, password: 'correct-horse-battery-staple' });
    expect(patchRes.status).toBe(200);

    await prisma.platformUser.deleteMany({ where: { email } });
  });

  it('a READ_ONLY user can read but not write commission config (billing: read)', async () => {
    const email = `test-platpay-readonly-${Date.now()}@example.com`;
    await createTestPlatformUser(prisma, { email, password: 'correct-horse-battery-staple', role: 'READ_ONLY' });
    const loginRes = await platformLogin(app, email, 'correct-horse-battery-staple');
    const token = loginRes.body.accessToken;

    const getRes = await authed('get', '/api/v1/payments/commission-config', token);
    expect(getRes.status).toBe(200);
    const patchRes = await authed('patch', '/api/v1/payments/commission-config', token).send({ defaultBps: 100 });
    expect(patchRes.status).toBe(403);

    await prisma.platformUser.deleteMany({ where: { email } });
  });

  it('setDefaultCommissionBps requires the correct step-up password', async () => {
    const wrong = await authed('patch', '/api/v1/payments/commission-config', platformToken).send({ defaultBps: 250, password: 'wrong' });
    expect(wrong.status).toBe(403);
    const missing = await authed('patch', '/api/v1/payments/commission-config', platformToken).send({ defaultBps: 150 });
    expect(missing.status).toBe(403); // password is optional at the schema level; requireStepUpPassword rejects a missing one the same as a wrong one
    const right = await authed('patch', '/api/v1/payments/commission-config', platformToken).send({ defaultBps: 250, password: adminPassword });
    expect(right.status).toBe(200);
  });

  it('GET /platform-summary returns zeroed aggregates for a restaurant with no payments', async () => {
    const freshRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Empty Summary Restaurant ${Date.now()}`, ownerName: 'Empty Owner', ownerEmail: `empty-owner-${Date.now()}@test.example.com`
    });
    const res = await authed('get', `/api/v1/payments/platform-summary?restaurantId=${freshRes.body.restaurant.id}`, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.grossVolume).toBe(0);
    expect(res.body.platformCommission).toBe(0);
    expect(res.body.refundedAmount).toBe(0);
    expect(res.body.successfulCount).toBe(0);
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: freshRes.body.restaurant.id } }));
  });

  it('GET /platform-summary aggregates gross volume across successful payments', async () => {
    await seedPayment(10000, 'SUCCESS');
    await seedPayment(20000, 'SUCCESS');
    const res = await authed('get', `/api/v1/payments/platform-summary?restaurantId=${restaurantId}`, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.grossVolume).toBeGreaterThanOrEqual(30000);
  });

  it('a device token cannot read the platform summary', async () => {
    const res = await authed('get', `/api/v1/payments/platform-summary?restaurantId=${restaurantId}`, posToken);
    expect(res.status).toBe(401);
  });

  it('a SUPPORT_ADMIN has no billing area access at all, not even read', async () => {
    const email = `test-platpay-support-${Date.now()}@example.com`;
    await createTestPlatformUser(prisma, { email, password: 'correct-horse-battery-staple', role: 'SUPPORT_ADMIN' });
    const loginRes = await platformLogin(app, email, 'correct-horse-battery-staple');
    const token = loginRes.body.accessToken;

    const getRes = await authed('get', '/api/v1/payments/commission-config', token);
    expect(getRes.status).toBe(403);

    await prisma.platformUser.deleteMany({ where: { email } });
  });
});
