// cloud/api/test/payments-webhook.e2e.spec.ts
import { createHmac } from 'crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

const WEBHOOK_SECRET = 'test-webhook-secret-for-e2e';

describe('Cashfree webhook processing', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-webhook-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let orderId: string;
  let paymentId: string;
  const providerOrderId = `pay_${Date.now()}`;
  // Every other identifier in this fixture (providerOrderId, restaurantId, adminEmail)
  // is suffixed with Date.now() so repeated runs of this suite never collide. cf_payment_id
  // feeds the webhook's derived dedup key (`${eventType}:${cf_payment_id}`) in WebhookEvent,
  // which is a permanent, provider-global audit log (never cleaned up, by design) — so it
  // must be run-unique too, or a later run's "duplicate" check would collide with this run's
  // already-PROCESSED row for the same key and silently swallow a legitimate webhook.
  const cfPaymentId = `cf_pay_${Date.now()}`;

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

  const successPayload = (amountRupees: number) => ({
    type: 'PAYMENT_SUCCESS_WEBHOOK',
    event_time: new Date().toISOString(),
    data: {
      order: { order_id: providerOrderId, order_amount: amountRupees, order_currency: 'INR' },
      payment: { cf_payment_id: cfPaymentId, payment_status: 'SUCCESS', payment_amount: amountRupees, payment_currency: 'INR', payment_method: { upi: {} } }
    }
  });

  beforeAll(async () => {
    process.env.CASHFREE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email: adminEmail, password: adminPassword });
    platformToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Webhook Restaurant ${Date.now()}`, ownerName: 'Webhook Owner', ownerEmail: `webhook-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;

    await prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.create({ data: { restaurantId, status: 'ACTIVE' } }));

    const order = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({
        data: { restaurantId, externalOrderId: 'webhook-test-order-1', items: [], subtotal: 20000, taxAmount: 1000, totalAmount: 21000, status: 'PENDING_PAYMENT' }
      })
    );
    orderId = order.id;
    const payment = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({ data: { orderId, restaurantId, providerOrderId, amount: 21000, currency: 'INR', status: 'PENDING' } })
    );
    paymentId = payment.id;
  });

  afterAll(async () => {
    delete process.env.CASHFREE_WEBHOOK_SECRET;
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('rejects a webhook with an invalid signature and leaves the payment untouched', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/payments/cashfree/webhook')
      .set('x-webhook-signature', 'not-a-real-signature')
      .set('x-webhook-timestamp', String(Math.floor(Date.now() / 1000)))
      .send(successPayload(210));
    expect(res.status).toBe(200); // always 200 once durably recorded — Cashfree should not retry a permanently invalid signature

    const payment = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId } }));
    expect(payment.status).toBe('PENDING');

    const events = await prisma.runAsPlatform((tx) => tx.webhookEvent.findMany({ where: { signatureValid: false } }));
    expect(events.length).toBeGreaterThan(0);
  });

  it('rejects a webhook whose amount does not match the stored payment', async () => {
    const res = await signedRequest(successPayload(999));
    expect(res.status).toBe(200);

    const payment = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId } }));
    expect(payment.status).toBe('PENDING');
  });

  it('a valid PAYMENT_SUCCESS_WEBHOOK marks the payment SUCCESS and the order PAID', async () => {
    const res = await signedRequest(successPayload(210));
    expect(res.status).toBe(200);

    const payment = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId } }));
    expect(payment.status).toBe('SUCCESS');
    expect(payment.providerPaymentId).toBe(cfPaymentId);
    expect(payment.paidAt).not.toBeNull();

    const order = await prisma.runAsPlatform((tx) => tx.order.findUniqueOrThrow({ where: { id: orderId } }));
    expect(order.status).toBe('PAID');

    const connection = await prisma.runAsPlatform((tx) => tx.restaurantPaymentConnection.findUniqueOrThrow({ where: { restaurantId } }));
    expect(connection.lastWebhookAt).not.toBeNull();
    expect(connection.lastPaymentAt).not.toBeNull();
  });

  it('a duplicate delivery of the same event is ignored and does not reprocess', async () => {
    const before = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId } }));
    const res = await signedRequest(successPayload(210));
    expect(res.status).toBe(200);
    const after = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId } }));
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it('an unknown order_id is recorded as a failed WebhookEvent without throwing', async () => {
    const res = await signedRequest({
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      event_time: new Date().toISOString(),
      data: { order: { order_id: 'pay_does_not_exist', order_amount: 100, order_currency: 'INR' }, payment: { cf_payment_id: 'cf_ghost', payment_status: 'SUCCESS', payment_amount: 100, payment_currency: 'INR' } }
    });
    expect(res.status).toBe(200);

    const events = await prisma.runAsPlatform((tx) => tx.webhookEvent.findMany({ where: { errorMessage: { contains: 'pay_does_not_exist' } } }));
    expect(events.length).toBe(1);
    expect(events[0].processingStatus).toBe('FAILED');
  });
});
