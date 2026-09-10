// cloud/api/test/payments-webhook.e2e.spec.ts
import { createHmac } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { json, raw, urlencoded } from 'express';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppModule } from '../src/app.module';

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

  it('a valid signature over malformed JSON bytes is recorded as a failed WebhookEvent, not an unhandled exception', async () => {
    // The shared `app` above is built via createTestApp(), which (per this file's Task 9
    // environment note) never registers main.ts's path-scoped raw() middleware for this
    // route — Nest's default JSON body-parser runs instead, and it rejects a malformed
    // `application/json` body with its own 400 before the request ever reaches our
    // controller. That's a different failure mode than the one under test here (the
    // service returning a durably-recorded 200 for a *signature-valid* but malformed
    // body) and supertest's `.send()` would re-serialize a JS value into valid JSON
    // anyway, so genuinely malformed bytes can't reach the controller through `app`.
    // A second, minimal app instance mirroring main.ts's raw()-then-json() wiring for
    // this one route is built here instead, so the exact malformed bytes reach the
    // controller unmodified, exactly as they would in production.
    const rawModuleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const rawApp = rawModuleRef.createNestApplication({ bodyParser: false });
    rawApp.use('/api/v1/payments/cashfree/webhook', raw({ type: '*/*', limit: '1mb' }));
    rawApp.use(json());
    rawApp.use(urlencoded({ extended: true }));
    await rawApp.init();

    try {
      // The providerEventKey for this branch is always `MALFORMED:${randomUUID()}` (there's
      // no cf_payment_id/order_id to derive a stable key from), so — unlike the other test
      // cases in this file — it never collides with a prior run's row, but it also never gets
      // reused/deduped: every run inserts a brand-new row. Scoping by createdAt keeps this
      // test's assertions about *its own* delivery correct even when the suite is re-run
      // without clearing WebhookEvent (a permanent, provider-global audit log by design).
      const testStartedAt = new Date();
      const malformedBody = '{"type":"PAYMENT_SUCCESS_WEBHOOK", this is not valid json';
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = createHmac('sha256', WEBHOOK_SECRET).update(timestamp + malformedBody).digest('base64');

      const res = await request(rawApp.getHttpServer())
        .post('/api/v1/payments/cashfree/webhook')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .send(malformedBody);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });

      const events = await prisma.runAsPlatform((tx) =>
        tx.webhookEvent.findMany({
          where: { errorMessage: { contains: 'Malformed webhook payload JSON' }, createdAt: { gte: testStartedAt } }
        })
      );
      expect(events.length).toBe(1);
      expect(events[0].processingStatus).toBe('FAILED');
      expect(events[0].signatureValid).toBe(true);
    } finally {
      await rawApp.close();
    }
  });

  it('an unconfigured webhook secret is recorded as a failed WebhookEvent, not an unhandled exception', async () => {
    // ConfigService (via ConfigModule.forRoot's `validate` option) snapshots process.env into
    // an internal validatedEnvConfig at module-init time and prefers that snapshot over live
    // process.env on every subsequent .get() call — so mutating process.env.CASHFREE_WEBHOOK_SECRET
    // after the shared `app` above has already booted would have no effect on it. A second,
    // fresh app instance (same pattern the malformed-JSON test above uses) is built here instead,
    // with the secret deleted from process.env *before* that instance compiles/initializes, so its
    // ConfigService genuinely sees it as unset.
    const savedSecret = process.env.CASHFREE_WEBHOOK_SECRET;
    delete process.env.CASHFREE_WEBHOOK_SECRET;
    let unconfiguredApp: INestApplication | undefined;
    try {
      unconfiguredApp = await createTestApp();

      const testStartedAt = new Date();
      const res = await request(unconfiguredApp.getHttpServer())
        .post('/api/v1/payments/cashfree/webhook')
        .set('x-webhook-signature', 'irrelevant-when-secret-is-unconfigured')
        .set('x-webhook-timestamp', String(Math.floor(Date.now() / 1000)))
        .send(successPayload(210));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });

      const events = await prisma.runAsPlatform((tx) =>
        tx.webhookEvent.findMany({
          where: { errorMessage: { contains: 'Cashfree webhook secret not configured' }, createdAt: { gte: testStartedAt } }
        })
      );
      expect(events.length).toBe(1);
      expect(events[0].processingStatus).toBe('FAILED');
      expect(events[0].signatureValid).toBe(false);
    } finally {
      if (unconfiguredApp) await unconfiguredApp.close();
      process.env.CASHFREE_WEBHOOK_SECRET = savedSecret;
    }
  });
});
