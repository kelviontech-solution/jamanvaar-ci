import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin, refundManagerSession } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { RazorpayGatewayService } from '../src/modules/payments/razorpay-gateway.service';

describe('Refund creation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-refund-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let posToken: string;
  let kioskToken: string;
  let planId: string;
  let createRefundMock: ReturnType<typeof vi.fn>;
  let managerSession: string;

  const authed = (method: 'get' | 'post', url: string, token: string) => {
    const req = request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
    return url.endsWith('/refund') && token === posToken ? req.send({ staffSession: managerSession }) : req;
  };

  beforeAll(async () => {
    createRefundMock = vi.fn().mockResolvedValue({ refundId: 'rfnd_mock', status: 'pending', amountPaise: 100 });
    app = await createTestApp((builder) =>
      builder.overrideProvider(RazorpayGatewayService).useValue({
        isConfigured: () => true,
        createRefund: createRefundMock
      })
    );
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await platformLogin(app, adminEmail, adminPassword);
    platformToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Refund Restaurant ${Date.now()}`, ownerName: 'Refund Owner', ownerEmail: `refund-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;

    // PRO tier — POS is already CORE-tier's default. Phase 5 split Kiosk into its own
    // commercial family, so a RESTAURANT-family PRO plan no longer defaults to including it —
    // this test needs both POS and KIOSK (for the "wrong device type" test), so it asks for
    // them explicitly rather than relying on tier defaults.
    const planRes = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO', name: `TEST Refund Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { selfOrderKiosk: true }
    });
    planId = planRes.body.id;
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      applications: ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN']
    });

    const posKeyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const posRedeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: posKeyRes.body.code, deviceType: 'POS' });
    posToken = posRedeemRes.body.deviceToken;
    managerSession = await refundManagerSession(app, prisma, posToken);

    const kioskKeyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'KIOSK', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const kioskRedeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: kioskKeyRes.body.code, deviceType: 'KIOSK' });
    kioskToken = kioskRedeemRes.body.deviceToken;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  beforeEach(async () => {
    // Isolate each scenario's device rate budget; production refund throttling stays enabled.
    const key = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const device = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: key.body.code, deviceType: 'POS' });
    expect(device.status).toBe(201);
    posToken = device.body.deviceToken;
    managerSession = await refundManagerSession(app, prisma, posToken);
  });

  const seedPaidOrder = async (amount: number) => {
    const order = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({ data: { restaurantId, externalOrderId: `refund-test-${Date.now()}-${Math.random()}`, items: [], subtotal: amount, taxAmount: 0, totalAmount: amount, status: 'PAID' } })
    );
    const payment = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({ data: { provider: 'RAZORPAY', providerPaymentId: `pay_rzp_${Date.now()}_${Math.random()}`, orderId: order.id, restaurantId, providerOrderId: `pay_${Date.now()}_${Math.random()}`, amount, currency: 'INR', status: 'SUCCESS' } })
    );
    return payment.id;
  };

  it('a KIOSK device cannot initiate a refund (403)', async () => {
    const paymentId = await seedPaidOrder(10000);
    const res = await authed('post', `/api/v1/payments/${paymentId}/refund`, kioskToken).send({ amountPaise: 10000, reason: 'Customer request', requestedBy: 'Test Manager' });
    expect(res.status).toBe(403);
  });

  it('creates a refund, sets PaymentTransaction to REFUND_PENDING, never claims REFUNDED synchronously', async () => {
    const paymentId = await seedPaidOrder(10000);
    const res = await authed('post', `/api/v1/payments/${paymentId}/refund`, posToken).send({ amountPaise: 10000, reason: 'Customer request', requestedBy: 'Test Manager' });
    expect(res.status).toBe(201);
    expect(res.body.refundId).toBeTruthy();

    const payment = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId } }));
    expect(payment.status).toBe('REFUND_PENDING');

    const order = await prisma.runAsPlatform((tx) => tx.order.findUniqueOrThrow({ where: { id: payment.orderId } }));
    expect(order.status).toBe('PAID'); // untouched — only the webhook finalizes this
  });

  it('rejects a refund exceeding the remaining refundable amount', async () => {
    const paymentId = await seedPaidOrder(10000);
    const res = await authed('post', `/api/v1/payments/${paymentId}/refund`, posToken).send({ amountPaise: 10001, reason: 'Too much', requestedBy: 'Test Manager' });
    expect(res.status).toBe(400);
  });

  it('counts a PENDING refund against the remaining balance for a second request', async () => {
    const paymentId = await seedPaidOrder(10000);
    const first = await authed('post', `/api/v1/payments/${paymentId}/refund`, posToken).send({ amountPaise: 6000, reason: 'Partial 1', requestedBy: 'Test Manager' });
    expect(first.status).toBe(201);

    const second = await authed('post', `/api/v1/payments/${paymentId}/refund`, posToken).send({ amountPaise: 5000, reason: 'Partial 2', requestedBy: 'Test Manager' });
    expect(second.status).toBe(400); // 6000 + 5000 > 10000, and the first is still PENDING
  });

  it('rejects a refund on a payment that was never SUCCESS', async () => {
    const order = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({ data: { restaurantId, externalOrderId: `refund-unpaid-${Date.now()}`, items: [], subtotal: 5000, taxAmount: 0, totalAmount: 5000, status: 'PENDING_PAYMENT' } })
    );
    const payment = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({ data: { provider: 'RAZORPAY', providerPaymentId: `pay_rzp_${Date.now()}_${Math.random()}`, orderId: order.id, restaurantId, providerOrderId: `pay_unpaid_${Date.now()}`, amount: 5000, currency: 'INR', status: 'PENDING' } })
    );
    const res = await authed('post', `/api/v1/payments/${payment.id}/refund`, posToken).send({ amountPaise: 5000, reason: 'Too early', requestedBy: 'Test Manager' });
    expect(res.status).toBe(400);
  });

  it("a POS device from another restaurant cannot refund this restaurant's payment", async () => {
    const paymentId = await seedPaidOrder(10000);

    const otherRestaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Other Refund Restaurant ${Date.now()}`, ownerName: 'Other Owner', ownerEmail: `other-refund-owner-${Date.now()}@test.example.com`
    });
    const otherRestaurantId = otherRestaurantRes.body.restaurant.id;
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId: otherRestaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
    const otherKeyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId: otherRestaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const otherRedeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: otherKeyRes.body.code, deviceType: 'POS' });
    const otherPosToken = otherRedeemRes.body.deviceToken;

    const res = await authed('post', `/api/v1/payments/${paymentId}/refund`, otherPosToken).send({ amountPaise: 10000, reason: 'Cross-tenant attempt', requestedBy: 'Test Manager', staffSession: await refundManagerSession(app, prisma, otherPosToken) });
    expect(res.status).toBe(404); // tenant-scoped lookup finds nothing, not a 403 that would confirm the payment exists

    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: otherRestaurantId } }));
  });

  it('rejects a device-only cashier request even if it claims a manager name', async () => {
    const paymentId = await seedPaidOrder(10000);
    const res = await request(app.getHttpServer()).post(`/api/v1/payments/${paymentId}/refund`).set('Authorization', `Bearer ${posToken}`).send({ amountPaise: 1, reason: 'Bypass probe', requestedBy: 'Manager' });
    expect(res.status).toBe(403);
    expect(await prisma.runAsTenant(restaurantId, tx => tx.refund.count({ where: { paymentId } }))).toBe(0);
  });

  it('replays one refund idempotency key without another provider request', async () => {
    const paymentId = await seedPaidOrder(10000);
    const payload = { amountPaise: 100, reason: 'One intended refund', requestedBy: 'Untrusted Name', idempotencyKey: `qa-refund-${paymentId}` };
    const before = createRefundMock.mock.calls.length;
    const first = await authed('post', `/api/v1/payments/${paymentId}/refund`, posToken).send(payload);
    const repeat = await authed('post', `/api/v1/payments/${paymentId}/refund`, posToken).send(payload);
    expect(first.status).toBe(201); expect(repeat.status).toBe(201);
    expect(repeat.body.refundId).toBe(first.body.refundId);
    expect(createRefundMock.mock.calls.length - before).toBe(1);
    const changed = await authed('post', `/api/v1/payments/${paymentId}/refund`, posToken).send({ ...payload, amountPaise: 101 });
    expect(changed.status).toBe(409);
  });

  // security-audit LOW-02 regressions
  it('rejects a refund with no requestedBy — staff attribution is mandatory, not optional', async () => {
    const paymentId = await seedPaidOrder(10000);
    const res = await authed('post', `/api/v1/payments/${paymentId}/refund`, posToken).send({ amountPaise: 10000, reason: 'Customer request' });
    expect(res.status).toBe(400);
  });

  it('persists requestedBy on the Refund row and writes an audit log entry naming the device and the staff member', async () => {
    const paymentId = await seedPaidOrder(10000);
    const res = await authed('post', `/api/v1/payments/${paymentId}/refund`, posToken).send({ amountPaise: 10000, reason: 'Customer request', requestedBy: 'Priya Manager' });
    expect(res.status).toBe(201);

    const refund = await prisma.runAsPlatform((tx) => tx.refund.findUniqueOrThrow({ where: { id: res.body.refundId } }));
    expect(refund.requestedBy).toBe('Verified Refund Manager');

    const auditRows = await prisma.runAsPlatform((tx) =>
      tx.auditLog.findMany({ where: { restaurantId, action: 'REFUND_REQUESTED' }, orderBy: { createdAt: 'desc' } })
    );
    expect(auditRows.length).toBeGreaterThan(0);
    const details = auditRows[0].details as Record<string, unknown>;
    expect(details.requestedBy).toBe('Verified Refund Manager');
    expect(details.paymentId).toBe(paymentId);
  });

  it('never lets two concurrent refund requests both pass the remaining-balance check (row lock closes the race)', async () => {
    const paymentId = await seedPaidOrder(10000);

    const [first, second] = await Promise.all([
      authed('post', `/api/v1/payments/${paymentId}/refund`, posToken).send({ amountPaise: 6000, reason: 'Concurrent A', requestedBy: 'Test Manager' }),
      authed('post', `/api/v1/payments/${paymentId}/refund`, posToken).send({ amountPaise: 6000, reason: 'Concurrent B', requestedBy: 'Test Manager' })
    ]);

    const statuses = [first.status, second.status].sort();
    // Exactly one of the two ₹60 requests against a ₹100 payment must succeed —
    // both succeeding would refund ₹120 against a ₹100 payment.
    expect(statuses).toEqual([201, 400]);

    const committed = await prisma.runAsPlatform((tx) =>
      tx.refund.aggregate({ where: { paymentId, status: { in: ['SUCCESS', 'PENDING'] } }, _sum: { amount: true } })
    );
    expect(committed._sum.amount).toBeLessThanOrEqual(10000);
  });
});
