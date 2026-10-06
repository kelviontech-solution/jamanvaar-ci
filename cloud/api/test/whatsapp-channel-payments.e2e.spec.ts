import { createHash, createHmac } from 'crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { RazorpayGatewayService } from '../src/modules/payments/razorpay-gateway.service';

/**
 * Jamanvaar ↔ WhatsApp connector, Phase 4 (see
 * docs/integrations/JAMANVAAR_WHATSAPP_CONNECTOR_IMPLEMENTATION_PLAN.md): channels/quote,
 * channels/checkout and the payment→KDS ingestion this whole phase exists for — a WhatsApp
 * order must reach POS/KDS only once Razorpay actually confirms payment, never at checkout.
 *
 * No real Razorpay call is ever made here. `createPaymentLink` (the one method that would
 * actually reach Razorpay's API — this connector uses Payment Links, not Orders; see
 * RazorpayGatewayService's own comment on why) is mocked; every other RazorpayGatewayService
 * method — including `verifyWebhookSignature` — runs for real, pure local HMAC verification
 * with no network call and no secret ever printed. The "payment succeeded" side of every test
 * is a hand-signed webhook POST to this server's own `/api/v1/payments/razorpay/webhook`,
 * exactly like payments-webhook.e2e.spec.ts — never a call to Razorpay itself, never real money.
 */
describe('Jamanvaar WhatsApp connector — channels/quote, channels/checkout, payment→KDS ingestion', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-wa-pay-admin-${stamp}@example.com`;
  const SERVICE_SECRET = 'test-jamanvaar-service-secret-for-payments-e2e';
  const WEBHOOK_SECRET = 'test-razorpay-webhook-secret-for-wa-payments-e2e';
  let platformToken: string;
  let restaurantId: string;
  let branchId: string;
  let planId: string;
  const day = 86400_000;
  let cfCounter = 0;

  const http = () => request(app.getHttpServer());
  const platform = (method: 'get' | 'post', url: string) => http()[method](url).set('Authorization', `Bearer ${platformToken}`);
  const as = (method: 'get' | 'post', url: string, token: string) => http()[method](url).set('Authorization', `Bearer ${token}`);
  const push = (token: string, type: string, externalId: string, payload: Record<string, unknown>) =>
    as('post', `/api/v1/entity-sync/${type}`, token).send({ events: [{ externalId, payload: { id: externalId, ...payload, updatedAt: new Date().toISOString() } }] });

  function signedService(method: string, path: string, body: unknown = {}) {
    const timestamp = String(Date.now());
    const raw = JSON.stringify(body ?? {});
    const bodyHash = createHash('sha256').update(raw).digest('hex');
    const signature = createHmac('sha256', SERVICE_SECRET).update(`${method.toUpperCase()}\n${path}\n${timestamp}\n${bodyHash}`).digest('hex');
    return { headers: { 'x-signature': signature, 'x-timestamp': timestamp }, raw };
  }
  const asService = (method: 'get' | 'post', path: string, body: unknown = {}) => {
    const { headers, raw } = signedService(method, path, body);
    const req = http()[method](path).set('x-signature', headers['x-signature']).set('x-timestamp', headers['x-timestamp']).set('content-type', 'application/json');
    return method === 'post' ? req.send(raw) : req;
  };

  const signedWebhook = (payload: object) => {
    const rawBody = JSON.stringify(payload);
    const signature = createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
    return http().post('/api/v1/payments/razorpay/webhook').set('Content-Type', 'application/json').set('x-razorpay-signature', signature).send(rawBody);
  };
  // A Razorpay Payment Link event: payment_link.paid carries the payment too; expired and cancelled do not.
  const webhookLinkPayload = (referenceId: string, amountRupees: number, linkStatus: 'PAID' | 'EXPIRED' | 'CANCELLED') => {
    const amountPaise = Math.round(amountRupees * 100);
    const linkEntity = { id: `plink_${referenceId}`, reference_id: referenceId, amount: amountPaise, currency: 'INR', status: linkStatus === 'PAID' ? 'paid' : linkStatus.toLowerCase() };
    if (linkStatus !== 'PAID') {
      return { event: linkStatus === 'EXPIRED' ? 'payment_link.expired' : 'payment_link.cancelled', created_at: Math.floor(Date.now() / 1000), payload: { payment_link: { entity: linkEntity } } };
    }
    return {
      event: 'payment_link.paid',
      created_at: Math.floor(Date.now() / 1000),
      payload: {
        payment_link: { entity: linkEntity },
        payment: { entity: { id: `pay_${referenceId}`, amount: amountPaise, currency: 'INR', status: 'captured' } }
      }
    };
  };

  beforeAll(async () => {
    process.env.JAMANVAAR_SERVICE_SECRET = SERVICE_SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    app = await createTestApp();
    prisma = app.get(PrismaService);

    // The only Razorpay method that would make a real HTTP call (creating the payment link) is mocked; the
    // webhook signature check runs for real.
    const razorpay = app.get(RazorpayGatewayService);
    vi.spyOn(razorpay, 'createPaymentLink').mockImplementation(async (input) => ({
      linkId: `plink_${input.referenceId}`,
      shortUrl: `https://rzp.io/i/mock_${++cfCounter}`,
      status: 'created'
    }));

    await createTestPlatformUser(prisma, { email: adminEmail, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, adminEmail, 'correct-horse-battery-staple')).body.accessToken;

    planId = (await platform('post', '/api/v1/plans').send({ tier: 'PRO', name: `TEST WA Pay Plan ${stamp}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { posTerminal: true } })).body.id;
    const restRes = await platform('post', '/api/v1/restaurants').send({ name: `TEST WA Pay ${stamp}`, ownerName: 'Owner', ownerEmail: `wa-pay-${stamp}@example.com` });
    restaurantId = restRes.body.restaurant.id;
    // Phase 6: channels/quote|checkout|orders now gate on the real WHATSAPP_ORDERING
    // entitlement too (see WhatsAppChannelService.requireEntitled) -- explicit
    // `applications` grants it directly, alongside the POS_ADMIN this file's own
    // device-redemption step below still needs.
    await platform('post', '/api/v1/subscriptions').send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * day).toISOString(), applications: ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'WHATSAPP_ORDERING'] });

    const branch = await prisma.runAsTenant(restaurantId, (tx) => tx.branch.findFirstOrThrow({ where: { restaurantId } }));
    branchId = branch.id;

    const keyRes = await platform('post', '/api/v1/activation-keys').send({ restaurantId, allowedDeviceType: 'POS_ADMIN', expiresAt: new Date(Date.now() + day).toISOString() });
    const redeemRes = await http().post('/api/v1/activation/redeem').send({ code: keyRes.body.code, deviceType: 'POS_ADMIN' });
    const console_ = redeemRes.body.deviceToken as string;

    await push(console_, 'MENU_CATEGORY', 'cat-wa-pay', { name: 'Mains', isActive: true, sortOrder: 1 });
    await push(console_, 'MENU_ITEM', 'pizza-wa-pay', { categoryId: 'cat-wa-pay', name: 'Paneer Pizza', price: 249, isAvailable: true });
    await push(console_, 'MENU_ITEM', 'soldout-wa-pay', { categoryId: 'cat-wa-pay', name: 'Sold Out Dish', price: 99, isAvailable: false });
    await as('post', '/api/v1/menu/publish', console_).send({});

    await prisma.runAsTenant(restaurantId, (tx) =>
      tx.whatsAppChannelConnection.create({
        data: { restaurantId, keyPrefix: 'jmn_live_test', keyHash: `hash-wa-pay-${stamp}`, status: 'CONNECTED', connectedAt: new Date(), autoAccept: false }
      })
    );
    await prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.create({ data: { restaurantId, status: 'ACTIVE' } }));
  }, 120_000);

  afterAll(async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    await prisma.runAsPlatform((tx) => tx.whatsAppChannelConnection.deleteMany({ where: { restaurantId } }));
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  const cart = [{ itemId: 'pizza-wa-pay', quantity: 2, optionIds: [] }];

  describe('channels/quote', () => {
    it('returns the exact server price for a cart, never trusting a client total', async () => {
      const res = await asService('post', `/api/v1/service/whatsapp-channel/channels/quote?restaurantId=${restaurantId}`, { branchId, cart });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.lines[0].itemId).toBe('pizza-wa-pay');
      expect(res.body.lines[0].quantity).toBe(2);
      expect(res.body.total).toBeGreaterThan(0);
      expect(res.body.total).toBe(res.body.subtotal + res.body.tax);
    });

    it('rejects a cart with a sold-out item', async () => {
      const res = await asService('post', `/api/v1/service/whatsapp-channel/channels/quote?restaurantId=${restaurantId}`, {
        branchId,
        cart: [{ itemId: 'soldout-wa-pay', quantity: 1, optionIds: [] }]
      });
      expect(res.status).toBe(400);
    });

    it('rejects a cart referencing an unknown item', async () => {
      const res = await asService('post', `/api/v1/service/whatsapp-channel/channels/quote?restaurantId=${restaurantId}`, {
        branchId,
        cart: [{ itemId: 'does-not-exist', quantity: 1, optionIds: [] }]
      });
      expect(res.status).toBe(400);
    });
  });

  describe('channels/checkout: creates a payment session but no KDS-visible order yet', () => {
    it('rejects a DINE_IN checkout with no table number', async () => {
      const res = await asService('post', `/api/v1/service/whatsapp-channel/channels/checkout?restaurantId=${restaurantId}`, {
        branchId,
        cart,
        idempotencyKey: `wa-checkout-dinein-notable-${stamp}`,
        customer: { name: 'Asha', phone: '9876500001' },
        orderType: 'DINE_IN',
        externalOrderId: `wa-order-dinein-notable-${stamp}`
      });
      expect(res.status).toBe(400);
    });

    it('creates a payment-bookkeeping Order + Razorpay session, returns a hosted checkout link, and creates no SyncedOrder', async () => {
      const quote = await asService('post', `/api/v1/service/whatsapp-channel/channels/quote?restaurantId=${restaurantId}`, { branchId, cart });

      const res = await asService('post', `/api/v1/service/whatsapp-channel/channels/checkout?restaurantId=${restaurantId}`, {
        branchId,
        cart,
        idempotencyKey: `wa-checkout-1-${stamp}`,
        customer: { name: 'Asha Patel', phone: '9876500001', address: '12 MG Road' },
        orderType: 'PICKUP',
        externalOrderId: `wa-order-1-${stamp}`
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.amount).toBe(quote.body.total);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.paymentLink).toMatch(/^https:\/\/rzp\.io\/i\/mock_/);

      const order = await prisma.runAsPlatform((tx) => tx.order.findUniqueOrThrow({ where: { id: res.body.orderId } }));
      expect(order.source).toBe('WHATSAPP');
      const feeSnapshot = await prisma.runAsTenant(restaurantId, tx => tx.paymentTransaction.findFirstOrThrow({ where: { orderId: order.id } }));
      expect(feeSnapshot.commissionBps).toBe(0);
      expect(feeSnapshot.platformAmount).toBe(0);
      expect(feeSnapshot.restaurantAmount).toBe(feeSnapshot.amount);

      expect(order.branchId).toBe(branchId);
      expect(order.orderType).toBe('TAKEAWAY'); // PICKUP mapped to the platform's own vocabulary
      expect(order.customerName).toBe('Asha Patel');
      expect(order.customerPhone).toBe('9876500001');
      expect(order.status).toBe('PENDING_PAYMENT');

      // The whole point of Phase 4: not paid yet, so the kitchen must not see it.
      const synced = await prisma.runAsPlatform((tx) => tx.syncedOrder.findFirst({ where: { restaurantId, externalOrderId: order.externalOrderId } }));
      expect(synced).toBeNull();
    });

    it('is idempotent: retrying the same externalOrderId returns the same order, not a new one', async () => {
      const body = {
        branchId,
        cart,
        idempotencyKey: `wa-checkout-2-${stamp}`,
        customer: { name: 'Bala', phone: '9876500002' },
        orderType: 'PICKUP',
        externalOrderId: `wa-order-2-${stamp}`
      };
      const first = await asService('post', `/api/v1/service/whatsapp-channel/channels/checkout?restaurantId=${restaurantId}`, body);
      const second = await asService('post', `/api/v1/service/whatsapp-channel/channels/checkout?restaurantId=${restaurantId}`, body);
      expect(second.body.orderId).toBe(first.body.orderId);
      expect(second.body.paymentId).toBe(first.body.paymentId);

      const payments = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findMany({ where: { orderId: first.body.orderId } }));
      expect(payments.length).toBe(1);
    });

    it('refuses checkout while the channel is paused, but quote still works', async () => {
      await prisma.runAsTenant(restaurantId, (tx) => tx.whatsAppChannelConnection.update({ where: { restaurantId }, data: { pausedAt: new Date() } }));

      const checkoutRes = await asService('post', `/api/v1/service/whatsapp-channel/channels/checkout?restaurantId=${restaurantId}`, {
        branchId, cart, idempotencyKey: `wa-checkout-paused-${stamp}`, customer: { name: 'C', phone: '9876500003' }, orderType: 'PICKUP', externalOrderId: `wa-order-paused-${stamp}`
      });
      expect(checkoutRes.status).toBe(403);

      const quoteRes = await asService('post', `/api/v1/service/whatsapp-channel/channels/quote?restaurantId=${restaurantId}`, { branchId, cart });
      expect(quoteRes.status).toBe(200);

      await prisma.runAsTenant(restaurantId, (tx) => tx.whatsAppChannelConnection.update({ where: { restaurantId }, data: { pausedAt: null } }));
    });
  });

  describe('payment confirmation → order reaches POS/KDS only now', () => {
    it('before payment: getOrderStatus reports unpaid, no kitchen status', async () => {
      const checkout = await asService('post', `/api/v1/service/whatsapp-channel/channels/checkout?restaurantId=${restaurantId}`, {
        branchId, cart, idempotencyKey: `wa-checkout-3-${stamp}`, customer: { name: 'Chirag', phone: '9876500004' }, orderType: 'DELIVERY', externalOrderId: `wa-order-3-${stamp}`
      });
      const status = await asService('get', `/api/v1/service/whatsapp-channel/channels/orders/${checkout.body.orderId}?restaurantId=${restaurantId}`);
      expect(status.status).toBe(200);
      expect(status.body.paid).toBe(false);
      expect(status.body.kitchenStatus).toBeNull();
    });

    it('a signed Razorpay payment_link.paid webhook creates the SyncedOrder (status NEW, autoAccept is off) and getOrderStatus reflects it', async () => {
      const checkout = await asService('post', `/api/v1/service/whatsapp-channel/channels/checkout?restaurantId=${restaurantId}`, {
        branchId, cart, idempotencyKey: `wa-checkout-4-${stamp}`, customer: { name: 'Divya', phone: '9876500005' }, orderType: 'DELIVERY', externalOrderId: `wa-order-4-${stamp}`
      });
      const orderRow = await prisma.runAsPlatform((tx) => tx.order.findUniqueOrThrow({ where: { id: checkout.body.orderId } }));
      const payment = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findFirstOrThrow({ where: { orderId: orderRow.id } }));

      const webhookRes = await signedWebhook(webhookLinkPayload(payment.providerOrderId, checkout.body.amount, 'PAID'));
      expect(webhookRes.status).toBe(200);

      const paidOrder = await prisma.runAsPlatform((tx) => tx.order.findUniqueOrThrow({ where: { id: orderRow.id } }));
      expect(paidOrder.status).toBe('PAID');

      const synced = await prisma.runAsPlatform((tx) => tx.syncedOrder.findFirstOrThrow({ where: { restaurantId, externalOrderId: orderRow.externalOrderId } }));
      expect(synced.source).toBe('WHATSAPP');
      expect(synced.status).toBe('NEW'); // autoAccept is off for this restaurant
      expect(synced.paymentStatus).toBe('SUCCESS');
      expect(synced.branchId).toBe(branchId);
      expect(synced.orderType).toBe('DELIVERY');
      expect((synced.items as unknown[]).length).toBe(1);
      const meta = synced.meta as Record<string, unknown>;
      expect(meta.customerName).toBe('Divya');
      expect(meta.customerPhone).toBe('9876500005');
      expect(meta.paymentTransactionId).toBe(payment.id);

      const status = await asService('get', `/api/v1/service/whatsapp-channel/channels/orders/${checkout.body.orderId}?restaurantId=${restaurantId}`);
      expect(status.body.paid).toBe(true);
      expect(status.body.kitchenStatus).toBe('NEW');
      expect(status.body.publicOrderId).toBeTruthy();
    });

    it('a duplicate webhook delivery for an already-ingested order does not create a second SyncedOrder', async () => {
      const checkout = await asService('post', `/api/v1/service/whatsapp-channel/channels/checkout?restaurantId=${restaurantId}`, {
        branchId, cart, idempotencyKey: `wa-checkout-5-${stamp}`, customer: { name: 'Esha', phone: '9876500006' }, orderType: 'PICKUP', externalOrderId: `wa-order-5-${stamp}`
      });
      const orderRow = await prisma.runAsPlatform((tx) => tx.order.findUniqueOrThrow({ where: { id: checkout.body.orderId } }));
      const payment = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findFirstOrThrow({ where: { orderId: orderRow.id } }));

      const payload = webhookLinkPayload(payment.providerOrderId, checkout.body.amount, 'PAID');
      const first = await signedWebhook(payload);
      expect(first.status).toBe(200);
      const second = await signedWebhook(payload); // same cf_link_id + link_status -> same providerEventKey -> IGNORED_DUPLICATE
      expect(second.status).toBe(200);

      const rows = await prisma.runAsPlatform((tx) => tx.syncedOrder.findMany({ where: { restaurantId, externalOrderId: orderRow.externalOrderId } }));
      expect(rows.length).toBe(1);
    });

    it('with autoAccept on, a paid order lands directly in PREPARING', async () => {
      await prisma.runAsTenant(restaurantId, (tx) => tx.whatsAppChannelConnection.update({ where: { restaurantId }, data: { autoAccept: true } }));

      const checkout = await asService('post', `/api/v1/service/whatsapp-channel/channels/checkout?restaurantId=${restaurantId}`, {
        branchId, cart, idempotencyKey: `wa-checkout-6-${stamp}`, customer: { name: 'Farah', phone: '9876500007' }, orderType: 'PICKUP', externalOrderId: `wa-order-6-${stamp}`
      });
      const orderRow = await prisma.runAsPlatform((tx) => tx.order.findUniqueOrThrow({ where: { id: checkout.body.orderId } }));
      const payment = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findFirstOrThrow({ where: { orderId: orderRow.id } }));
      await signedWebhook(webhookLinkPayload(payment.providerOrderId, checkout.body.amount, 'PAID'));

      const synced = await prisma.runAsPlatform((tx) => tx.syncedOrder.findFirstOrThrow({ where: { restaurantId, externalOrderId: orderRow.externalOrderId } }));
      expect(synced.status).toBe('PREPARING');

      await prisma.runAsTenant(restaurantId, (tx) => tx.whatsAppChannelConnection.update({ where: { restaurantId }, data: { autoAccept: false } }));
    });

    it('an EXPIRED payment link never creates a SyncedOrder', async () => {
      const checkout = await asService('post', `/api/v1/service/whatsapp-channel/channels/checkout?restaurantId=${restaurantId}`, {
        branchId, cart, idempotencyKey: `wa-checkout-7-${stamp}`, customer: { name: 'Gopal', phone: '9876500008' }, orderType: 'PICKUP', externalOrderId: `wa-order-7-${stamp}`
      });
      const orderRow = await prisma.runAsPlatform((tx) => tx.order.findUniqueOrThrow({ where: { id: checkout.body.orderId } }));
      const payment = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findFirstOrThrow({ where: { orderId: orderRow.id } }));

      await signedWebhook(webhookLinkPayload(payment.providerOrderId, checkout.body.amount, 'EXPIRED'));

      const failedOrder = await prisma.runAsPlatform((tx) => tx.order.findUniqueOrThrow({ where: { id: orderRow.id } }));
      expect(failedOrder.status).toBe('PAYMENT_FAILED');
      const synced = await prisma.runAsPlatform((tx) => tx.syncedOrder.findFirst({ where: { restaurantId, externalOrderId: orderRow.externalOrderId } }));
      expect(synced).toBeNull();
    });

    it('a CANCELLED payment link also fails the payment and never creates a SyncedOrder', async () => {
      const checkout = await asService('post', `/api/v1/service/whatsapp-channel/channels/checkout?restaurantId=${restaurantId}`, {
        branchId, cart, idempotencyKey: `wa-checkout-8-${stamp}`, customer: { name: 'Harini', phone: '9876500009' }, orderType: 'PICKUP', externalOrderId: `wa-order-8-${stamp}`
      });
      const orderRow = await prisma.runAsPlatform((tx) => tx.order.findUniqueOrThrow({ where: { id: checkout.body.orderId } }));
      const payment = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findFirstOrThrow({ where: { orderId: orderRow.id } }));

      await signedWebhook(webhookLinkPayload(payment.providerOrderId, checkout.body.amount, 'CANCELLED'));

      const failedOrder = await prisma.runAsPlatform((tx) => tx.order.findUniqueOrThrow({ where: { id: orderRow.id } }));
      expect(failedOrder.status).toBe('PAYMENT_FAILED');
      const synced = await prisma.runAsPlatform((tx) => tx.syncedOrder.findFirst({ where: { restaurantId, externalOrderId: orderRow.externalOrderId } }));
      expect(synced).toBeNull();
    });
  });
});
