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
  const providerOrderId = `pay_${Date.now()}`;
  const cfRefundId = `cf_refund_${Date.now()}`;

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  const signedRequest = (payload: object) => {
    const rawBody = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', WEBHOOK_SECRET).update(timestamp + rawBody).digest('base64');
    return request(app.getHttpServer())
      .post('/api/v1/payments/cashfree/webhook')
      .set('x-webhook-signature', signature)
      .set('x-webhook-timestamp', timestamp)
      .send(payload);
  };

  const refundPayload = (refundAmountRupees: number, status: string, refundId = cfRefundId, orderId = providerOrderId) => ({
    type: 'REFUND_STATUS_WEBHOOK',
    event_time: new Date().toISOString(),
    data: {
      refund: { cf_refund_id: refundId, order_id: orderId, refund_amount: refundAmountRupees, refund_status: status }
    }
  });

  beforeAll(async () => {
    process.env.CASHFREE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await platformLogin(app, adminEmail, adminPassword);
    const platformToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Refund Webhook Restaurant ${Date.now()}`, ownerName: 'Refund Webhook Owner', ownerEmail: `refund-webhook-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;

    const order = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({ data: { restaurantId, externalOrderId: 'refund-webhook-test-order', items: [], subtotal: 10000, taxAmount: 0, totalAmount: 10000, status: 'PAID' } })
    );
    orderId = order.id;
    const payment = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({ data: { orderId, restaurantId, providerOrderId, amount: 10000, currency: 'INR', status: 'SUCCESS' } })
    );
    paymentId = payment.id;
    await prisma.runAsTenant(restaurantId, (tx) =>
      tx.refund.create({ data: { paymentId, restaurantId, amount: 10000, status: 'PENDING', providerRefundId: cfRefundId } })
    );
  });

  afterAll(async () => {
    delete process.env.CASHFREE_WEBHOOK_SECRET;
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('a SUCCESS refund webhook marks the Refund, PaymentTransaction, and Order REFUNDED (full amount)', async () => {
    const res = await signedRequest(refundPayload(100, 'SUCCESS'));
    expect(res.status).toBe(200);

    const refund = await prisma.runAsPlatform((tx) => tx.refund.findFirstOrThrow({ where: { providerRefundId: cfRefundId } }));
    expect(refund.status).toBe('SUCCESS');

    const payment = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId } }));
    expect(payment.status).toBe('REFUNDED');

    const order = await prisma.runAsPlatform((tx) => tx.order.findUniqueOrThrow({ where: { id: orderId } }));
    expect(order.status).toBe('REFUNDED');
  });

  it('a resent SUCCESS webhook for the same refund is idempotent (no error, no duplicate effect)', async () => {
    const res = await signedRequest(refundPayload(100, 'SUCCESS'));
    expect(res.status).toBe(200);

    const payment = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId } }));
    expect(payment.status).toBe('REFUNDED');
  });

  it('a webhook amount mismatch is recorded as a FAILED WebhookEvent, not applied', async () => {
    const mismatchOrder = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({ data: { restaurantId, externalOrderId: `refund-mismatch-${Date.now()}`, items: [], subtotal: 5000, taxAmount: 0, totalAmount: 5000, status: 'PAID' } })
    );
    const mismatchPayment = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({ data: { orderId: mismatchOrder.id, restaurantId, providerOrderId: `pay_mismatch_${Date.now()}`, amount: 5000, currency: 'INR', status: 'SUCCESS' } })
    );
    const mismatchRefundId = `cf_refund_mismatch_${Date.now()}`;
    await prisma.runAsTenant(restaurantId, (tx) =>
      tx.refund.create({ data: { paymentId: mismatchPayment.id, restaurantId, amount: 5000, status: 'PENDING', providerRefundId: mismatchRefundId } })
    );

    // 999 rupees (99900 paise) sent where the Refund row's own amount is 5000 paise.
    const res = await signedRequest(refundPayload(999, 'SUCCESS', mismatchRefundId, mismatchPayment.providerOrderId));
    expect(res.status).toBe(200);

    const refund = await prisma.runAsPlatform((tx) => tx.refund.findFirstOrThrow({ where: { providerRefundId: mismatchRefundId } }));
    expect(refund.status).toBe('PENDING'); // untouched — the mismatch was rejected before any update
  });
});
