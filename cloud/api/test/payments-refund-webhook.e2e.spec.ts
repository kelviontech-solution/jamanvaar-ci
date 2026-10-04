import { createHmac } from 'crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

const WEBHOOK_SECRET = 'test-refund-webhook-secret';

describe('Refund webhook processing', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-refund-webhook-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let restaurantId: string;
  let orderId: string;
  let paymentId: string;
  const providerOrderId = `pay_ref_${Date.now()}`;
  const rzpRefundId = `rfnd_${Date.now()}`;

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  const signedEvent = (payload: object) => {
    const signature = createHmac('sha256', WEBHOOK_SECRET).update(JSON.stringify(payload)).digest('hex');
    return request(app.getHttpServer())
      .post('/api/v1/payments/razorpay/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(JSON.stringify(payload));
  };

  const refundEvent = (event: 'refund.processed' | 'refund.failed', amountPaise: number, refundId = rzpRefundId) => ({
    event,
    created_at: Math.floor(Date.now() / 1000),
    payload: { refund: { entity: { id: refundId, amount: amountPaise, currency: 'INR', status: event === 'refund.processed' ? 'processed' : 'failed' } } }
  });

  beforeAll(async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    const platformToken = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Refund Webhook Restaurant ${Date.now()}`,
      ownerName: 'Refund Webhook Owner',
      ownerEmail: `refund-webhook-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;

    const order = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({ data: { restaurantId, externalOrderId: `refund-webhook-order-${Date.now()}`, items: [], subtotal: 10000, taxAmount: 0, totalAmount: 10000, status: 'PAID' } })
    );
    orderId = order.id;
    const payment = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({
        data: { provider: 'RAZORPAY', providerPaymentId: `pay_rzp_${Date.now()}`, orderId, restaurantId, providerOrderId, amount: 10000, currency: 'INR', status: 'REFUND_PENDING' }
      })
    );
    paymentId = payment.id;
    await prisma.runAsTenant(restaurantId, (tx) => tx.refund.create({ data: { paymentId, restaurantId, amount: 10000, status: 'PENDING', providerRefundId: rzpRefundId } }));
  });

  afterAll(async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('a processed refund marks the Refund SUCCESS, the payment REFUNDED and the order REFUNDED for the full amount', async () => {
    const res = await signedEvent(refundEvent('refund.processed', 10000));
    expect(res.status).toBe(200);

    const refund = await prisma.runAsPlatform((tx) => tx.refund.findFirstOrThrow({ where: { providerRefundId: rzpRefundId } }));
    expect(refund.status).toBe('SUCCESS');
    const payment = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId } }));
    expect(payment.status).toBe('REFUNDED');
    const order = await prisma.runAsPlatform((tx) => tx.order.findUniqueOrThrow({ where: { id: orderId } }));
    expect(order.status).toBe('REFUNDED');
  });

  it('a resent refund webhook is idempotent', async () => {
    const res = await signedEvent(refundEvent('refund.processed', 10000));
    expect(res.status).toBe(200);
    const payment = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId } }));
    expect(payment.status).toBe('REFUNDED');
  });

  it('a refund webhook whose amount does not match the Refund row is recorded as FAILED and not applied', async () => {
    const mismatchOrder = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({ data: { restaurantId, externalOrderId: `refund-mismatch-${Date.now()}`, items: [], subtotal: 5000, taxAmount: 0, totalAmount: 5000, status: 'PAID' } })
    );
    const mismatchPayment = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({
        data: { provider: 'RAZORPAY', providerPaymentId: `pay_mm_${Date.now()}`, orderId: mismatchOrder.id, restaurantId, providerOrderId: `pay_mismatch_${Date.now()}`, amount: 5000, currency: 'INR', status: 'REFUND_PENDING' }
      })
    );
    const mismatchRefundId = `rfnd_mismatch_${Date.now()}`;
    await prisma.runAsTenant(restaurantId, (tx) =>
      tx.refund.create({ data: { paymentId: mismatchPayment.id, restaurantId, amount: 5000, status: 'PENDING', providerRefundId: mismatchRefundId } })
    );

    const res = await signedEvent(refundEvent('refund.processed', 99900, mismatchRefundId));
    expect(res.status).toBe(200);
    const refund = await prisma.runAsPlatform((tx) => tx.refund.findFirstOrThrow({ where: { providerRefundId: mismatchRefundId } }));
    expect(refund.status).toBe('PENDING');
    const failed = await prisma.runAsPlatform((tx) =>
      tx.webhookEvent.findFirst({ where: { provider: 'RAZORPAY', processingStatus: 'FAILED', errorMessage: { contains: 'Refund amount mismatch' } } })
    );
    expect(failed).not.toBeNull();
  });

  it('a failed refund returns the payment to SUCCESS so it can be refunded again', async () => {
    const failedOrder = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({ data: { restaurantId, externalOrderId: `refund-failed-${Date.now()}`, items: [], subtotal: 4000, taxAmount: 0, totalAmount: 4000, status: 'PAID' } })
    );
    const failedPayment = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({
        data: { provider: 'RAZORPAY', providerPaymentId: `pay_fr_${Date.now()}`, orderId: failedOrder.id, restaurantId, providerOrderId: `pay_fr_ref_${Date.now()}`, amount: 4000, currency: 'INR', status: 'REFUND_PENDING' }
      })
    );
    const refundId = `rfnd_fail_${Date.now()}`;
    await prisma.runAsTenant(restaurantId, (tx) => tx.refund.create({ data: { paymentId: failedPayment.id, restaurantId, amount: 4000, status: 'PENDING', providerRefundId: refundId } }));

    const res = await signedEvent(refundEvent('refund.failed', 4000, refundId));
    expect(res.status).toBe(200);
    const payment = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: failedPayment.id } }));
    expect(payment.status).toBe('SUCCESS');
  });
});
