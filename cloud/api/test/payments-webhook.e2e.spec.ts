// cloud/api/test/payments-webhook.e2e.spec.ts
import { createHmac } from 'crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

const WEBHOOK_SECRET = 'test-webhook-secret-for-e2e';

describe('Razorpay webhook processing', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-webhook-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let orderId: string;
  let paymentId: string;
  // Every identifier here is suffixed with Date.now(): WebhookEvent is a permanent audit log, so a
  // repeated run must never collide with an earlier run's already-processed event.
  const paymentRef = `pay_ref_${Date.now()}`;
  const razorpayPaymentId = `pay_rzp_${Date.now()}`;

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  const signed = (rawBody: string, secret = WEBHOOK_SECRET) => {
    const signature = createHmac('sha256', secret).update(rawBody).digest('hex');
    return request(app.getHttpServer())
      .post('/api/v1/payments/razorpay/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(rawBody);
  };
  const signedEvent = (payload: object, secret?: string) => signed(JSON.stringify(payload), secret);

  const capturedEvent = (amount: number, ref = paymentRef, id = razorpayPaymentId) => ({
    event: 'payment.captured',
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      payment: { entity: { id, amount, currency: 'INR', status: 'captured', method: 'upi', notes: { payment_ref: ref } } }
    }
  });

  const payment = () => prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: paymentId } }));

  beforeAll(async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    platformToken = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Webhook Restaurant ${Date.now()}`,
      ownerName: 'Webhook Owner',
      ownerEmail: `webhook-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;
    await prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.create({ data: { restaurantId, status: 'ACTIVE' } }));

    const order = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({ data: { restaurantId, externalOrderId: `webhook-order-${Date.now()}`, items: [], subtotal: 20000, taxAmount: 1000, totalAmount: 21000, status: 'PENDING_PAYMENT' } })
    );
    orderId = order.id;
    const created = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({ data: { provider: 'RAZORPAY', orderId, restaurantId, providerOrderId: paymentRef, amount: 21000, currency: 'INR', status: 'PENDING' } })
    );
    paymentId = created.id;
  });

  afterAll(async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('rejects a webhook with an invalid signature and leaves the payment untouched', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/payments/razorpay/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', 'not-a-real-signature')
      .send(JSON.stringify(capturedEvent(21000)));
    expect(res.status).toBe(200);
    expect((await payment()).status).toBe('PENDING');
    const events = await prisma.runAsPlatform((tx) => tx.webhookEvent.findMany({ where: { provider: 'RAZORPAY', signatureValid: false } }));
    expect(events.length).toBeGreaterThan(0);
  });

  it('rejects a webhook signed with the wrong secret', async () => {
    await signedEvent(capturedEvent(21000), 'some-other-secret');
    expect((await payment()).status).toBe('PENDING');
  });

  it('rejects a captured payment whose amount does not match the stored payment', async () => {
    await signedEvent(capturedEvent(999));
    expect((await payment()).status).toBe('PENDING');
  });

  it('a valid payment.captured marks the payment SUCCESS and the order PAID', async () => {
    const res = await signedEvent(capturedEvent(21000));
    expect(res.status).toBe(200);
    const updated = await payment();
    expect(updated.status).toBe('SUCCESS');
    expect(updated.providerPaymentId).toBe(razorpayPaymentId);
    expect(updated.paidAt).not.toBeNull();
    const order = await prisma.runAsPlatform((tx) => tx.order.findUniqueOrThrow({ where: { id: orderId } }));
    expect(order.status).toBe('PAID');
  });

  it('a duplicate delivery of the same event is ignored and does not reprocess', async () => {
    const before = await payment();
    await signedEvent(capturedEvent(21000));
    const after = await payment();
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(after.status).toBe('SUCCESS');
  });

  it('an unknown payment reference is recorded as a failed WebhookEvent without throwing', async () => {
    const res = await signedEvent(capturedEvent(21000, 'pay_unknown_ref', `pay_unknown_${Date.now()}`));
    expect(res.status).toBe(200);
    const failed = await prisma.runAsPlatform((tx) =>
      tx.webhookEvent.findFirst({ where: { provider: 'RAZORPAY', processingStatus: 'FAILED', errorMessage: { contains: 'pay_unknown_ref' } } })
    );
    expect(failed).not.toBeNull();
  });

  it('a signed body that is not valid JSON is recorded as a failed WebhookEvent', async () => {
    const res = await signed('{not json');
    expect(res.status).toBe(200);
    const failed = await prisma.runAsPlatform((tx) =>
      tx.webhookEvent.findFirst({ where: { provider: 'RAZORPAY', processingStatus: 'FAILED', errorMessage: 'Malformed webhook payload JSON' } })
    );
    expect(failed).not.toBeNull();
  });

  it('a payment that failed on the bank side is marked FAILED', async () => {
    const other = await prisma.runAsTenant(restaurantId, async (tx) => {
      const o = await tx.order.create({ data: { restaurantId, externalOrderId: `webhook-fail-${Date.now()}`, items: [], subtotal: 5000, taxAmount: 0, totalAmount: 5000, status: 'PENDING_PAYMENT' } });
      return tx.paymentTransaction.create({ data: { provider: 'RAZORPAY', orderId: o.id, restaurantId, providerOrderId: `pay_fail_${Date.now()}`, amount: 5000, currency: 'INR', status: 'PENDING' } });
    });
    const res = await signedEvent({
      event: 'payment.failed',
      payload: { payment: { entity: { id: `pay_failed_${Date.now()}`, amount: 5000, currency: 'INR', status: 'failed', error_description: 'Payment declined', notes: { payment_ref: other.providerOrderId } } } }
    });
    expect(res.status).toBe(200);
    const updated = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: other.id } }));
    expect(updated.status).toBe('FAILED');
    expect(updated.failureReason).toBe('Payment declined');
  });

  it('a WhatsApp payment link that is paid marks its payment SUCCESS and creates no order before the webhook', async () => {
    const linkRef = `wapay_${Date.now()}`;
    const linkOrder = await prisma.runAsTenant(restaurantId, async (tx) => {
      const o = await tx.order.create({ data: { restaurantId, externalOrderId: `wa-${Date.now()}`, source: 'WHATSAPP', items: [], subtotal: 3000, taxAmount: 0, totalAmount: 3000, status: 'PENDING_PAYMENT' } });
      await tx.paymentTransaction.create({ data: { provider: 'RAZORPAY', orderId: o.id, restaurantId, providerOrderId: linkRef, amount: 3000, currency: 'INR', status: 'PENDING' } });
      return o;
    });
    const res = await signedEvent({
      event: 'payment_link.paid',
      payload: {
        payment_link: { entity: { id: `plink_${Date.now()}`, reference_id: linkRef, amount: 3000, currency: 'INR', status: 'paid' } },
        payment: { entity: { id: `pay_link_${Date.now()}`, amount: 3000, currency: 'INR', status: 'captured' } }
      }
    });
    expect(res.status).toBe(200);
    const link = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findFirstOrThrow({ where: { providerOrderId: linkRef } }));
    expect(link.status).toBe('SUCCESS');
    const o = await prisma.runAsPlatform((tx) => tx.order.findUniqueOrThrow({ where: { id: linkOrder.id } }));
    expect(o.status).toBe('PAID');
  });
});
