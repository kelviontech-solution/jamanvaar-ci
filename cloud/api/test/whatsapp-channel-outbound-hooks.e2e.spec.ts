import { createHash, createHmac } from 'crypto';
import { createServer, Server, IncomingMessage } from 'http';
import { AddressInfo } from 'net';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { CashfreeGatewayService } from '../src/modules/payments/cashfree-gateway.service';

/**
 * Jamanvaar <-> WhatsApp connector, Phase 5: the outbound half — order.confirmed fires once
 * a WhatsApp order's payment is confirmed (see PaymentsService.ingestWhatsAppOrderIfNeeded),
 * order.status fires on every later status change a POS/KDS device pushes (see
 * OrderSyncService.pushEvents). Both are delivered through WhatsAppOutboundWebhookService,
 * whose own signing/retry mechanics are covered by whatsapp-outbound-webhook.e2e.spec.ts —
 * this file only proves the two hook points fire with the right payload at the right time,
 * against a real local HTTP receiver (not a mock), the same discipline as that file.
 */
describe('Jamanvaar WhatsApp connector — outbound order.confirmed / order.status hooks', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let receiver: Server;
  let receiverPort: number;
  let received: Array<{ headers: IncomingMessage['headers']; rawBody: string }> = [];
  const stamp = Date.now();
  const SERVICE_SECRET = 'test-jamanvaar-service-secret-for-outbound-hooks-e2e';
  const WEBHOOK_SECRET = 'test-cashfree-webhook-secret-for-outbound-hooks-e2e';
  let platformToken: string;
  let restaurantId: string;
  let branchId: string;
  let planId: string;
  let posToken: string;
  const day = 86400_000;
  let cfCounter = 0;

  const http_ = () => request(app.getHttpServer());
  const platform = (method: 'get' | 'post', url: string) => http_()[method](url).set('Authorization', `Bearer ${platformToken}`);
  const as = (method: 'get' | 'post', url: string, token: string) => http_()[method](url).set('Authorization', `Bearer ${token}`);
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
    const req = http_()[method](path).set('x-signature', headers['x-signature']).set('x-timestamp', headers['x-timestamp']).set('content-type', 'application/json');
    return method === 'post' ? req.send(raw) : req;
  };

  const signedWebhook = (payload: object) => {
    const rawBody = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', WEBHOOK_SECRET).update(timestamp + rawBody).digest('base64');
    return http_().post('/api/v1/payments/cashfree/webhook').set('x-webhook-signature', signature).set('x-webhook-timestamp', timestamp).send(payload);
  };
  const webhookLinkPayload = (linkId: string, amountRupees: number) => ({
    type: 'PAYMENT_LINK_EVENT',
    event_time: new Date().toISOString(),
    data: {
      link_id: linkId,
      cf_link_id: `cf_link_hooks_${stamp}_${++cfCounter}`,
      link_status: 'PAID',
      link_amount: amountRupees,
      link_amount_paid: amountRupees,
      link_currency: 'INR',
      order: { order_id: `cforder_hooks_${stamp}_${cfCounter}`, order_amount: amountRupees, transaction_id: `txn_hooks_${stamp}_${cfCounter}`, transaction_status: 'SUCCESS' }
    }
  });

  async function waitUntil<T>(check: () => Promise<T | undefined | null | false>, timeoutMs = 3000, intervalMs = 25): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const result = await check();
      if (result) return result;
      if (Date.now() > deadline) throw new Error('waitUntil: timed out');
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  beforeAll(async () => {
    receiver = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        received.push({ headers: req.headers, rawBody: Buffer.concat(chunks).toString('utf8') });
        res.statusCode = 200;
        res.end(JSON.stringify({ received: true }));
      });
    });
    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
    receiverPort = (receiver.address() as AddressInfo).port;

    process.env.JAMANVAAR_SERVICE_SECRET = SERVICE_SECRET;
    process.env.CASHFREE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.WHATSAPP_CONNECTOR_BASE_URL = `http://127.0.0.1:${receiverPort}`;
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const cashfree = app.get(CashfreeGatewayService);
    vi.spyOn(cashfree, 'isConfigured').mockReturnValue(true);
    vi.spyOn(cashfree, 'createPaymentLink').mockImplementation(async (input) => ({
      linkId: input.linkId,
      cfLinkId: `cf_link_${++cfCounter}`,
      linkUrl: `https://payments-test.cashfree.com/links/mock_${cfCounter}`,
      linkStatus: 'ACTIVE'
    }));

    await createTestPlatformUser(prisma, { email: `test-outbound-hooks-admin-${stamp}@example.com`, password: 'correct-horse-battery-staple' });
    platformToken = (await platformLogin(app, `test-outbound-hooks-admin-${stamp}@example.com`, 'correct-horse-battery-staple')).body.accessToken;

    planId = (await platform('post', '/api/v1/plans').send({ tier: 'PRO', name: `TEST Outbound Hooks Plan ${stamp}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { posTerminal: true } })).body.id;
    const restRes = await platform('post', '/api/v1/restaurants').send({ name: `TEST Outbound Hooks ${stamp}`, ownerName: 'Owner', ownerEmail: `outbound-hooks-${stamp}@example.com` });
    restaurantId = restRes.body.restaurant.id;
    // Phase 6: channels/checkout now gates on the real WHATSAPP_ORDERING entitlement too
    // (see WhatsAppChannelService.requireEntitled) -- explicit `applications` grants it
    // directly, alongside the POS_ADMIN this file's own device-redemption step still needs.
    await platform('post', '/api/v1/subscriptions').send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * day).toISOString(), applications: ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'WHATSAPP_ORDERING'] });

    const branch = await prisma.runAsTenant(restaurantId, (tx) => tx.branch.findFirstOrThrow({ where: { restaurantId } }));
    branchId = branch.id;

    const adminKeyRes = await platform('post', '/api/v1/activation-keys').send({ restaurantId, allowedDeviceType: 'POS_ADMIN', expiresAt: new Date(Date.now() + day).toISOString() });
    const adminRedeemRes = await http_().post('/api/v1/activation/redeem').send({ code: adminKeyRes.body.code, deviceType: 'POS_ADMIN' });
    const console_ = adminRedeemRes.body.deviceToken as string;
    posToken = console_; // POS_ADMIN is staff-proof-exempt (see order-sync.service.ts), simplest device for pushing status updates in this test

    await push(console_, 'MENU_CATEGORY', 'cat-outbound-hooks', { name: 'Mains', isActive: true, sortOrder: 1 });
    await push(console_, 'MENU_ITEM', 'pizza-outbound-hooks', { categoryId: 'cat-outbound-hooks', name: 'Paneer Pizza', price: 249, isAvailable: true });
    await as('post', '/api/v1/menu/publish', console_).send({});

    await prisma.runAsTenant(restaurantId, (tx) =>
      tx.whatsAppChannelConnection.create({
        data: { restaurantId, keyPrefix: 'jmn_live_test', keyHash: `hash-outbound-hooks-${stamp}`, status: 'CONNECTED', connectedAt: new Date(), autoAccept: false }
      })
    );
    await prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.create({ data: { restaurantId, status: 'ACTIVE' } }));
  }, 120_000);

  afterEach(() => {
    received = [];
  });

  afterAll(async () => {
    delete process.env.CASHFREE_WEBHOOK_SECRET;
    delete process.env.WHATSAPP_CONNECTOR_BASE_URL;
    await prisma.runAsPlatform((tx) => tx.whatsAppChannelConnection.deleteMany({ where: { restaurantId } }));
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: `test-outbound-hooks-admin-${stamp}@example.com` } });
    await app.close();
    await new Promise<void>((resolve) => receiver.close(() => resolve()));
  });

  const cart = [{ itemId: 'pizza-outbound-hooks', quantity: 1, optionIds: [] }];
  let syncedExternalOrderId: string;
  let checkoutPaymentId: string;

  it('a paid WhatsApp order fires a real, signed order.confirmed delivery to product/whatsapp', async () => {
    const checkout = await asService('post', `/api/v1/service/whatsapp-channel/channels/checkout?restaurantId=${restaurantId}`, {
      branchId, cart, idempotencyKey: `outbound-hooks-checkout-1-${stamp}`, customer: { name: 'Hina', phone: '9876500010' }, orderType: 'PICKUP', externalOrderId: `outbound-hooks-order-1-${stamp}`
    });
    expect(checkout.status, JSON.stringify(checkout.body)).toBe(201);
    checkoutPaymentId = checkout.body.paymentId;

    const payment = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: checkoutPaymentId } }));
    await signedWebhook(webhookLinkPayload(payment.providerOrderId, checkout.body.amount));

    const req = await waitUntil(async () => received.find((r) => JSON.parse(r.rawBody).type === 'order.confirmed'));
    const body = JSON.parse(req.rawBody);
    expect(body.restaurantId).toBe(restaurantId);
    expect(body.data.paymentId).toBe(checkoutPaymentId);
    expect(body.data.status).toBe('NEW'); // autoAccept is off for this restaurant
    expect(typeof body.data.publicOrderId).toBe('string');

    const orderRow = await prisma.runAsPlatform((tx) => tx.order.findUniqueOrThrow({ where: { id: body.data.orderId } }));
    syncedExternalOrderId = orderRow.externalOrderId;

    // See whatsapp-outbound-webhook.e2e.spec.ts's identical comment: the predicate must
    // reject a row still PENDING (a real, if narrow, race between "request received" and
    // "DB row updated"), not just "row exists".
    const deliveryRow = await waitUntil(async () => {
      const r = await prisma.runAsPlatform((tx) => tx.outboundWebhookDelivery.findFirst({ where: { restaurantId, eventType: 'order.confirmed' } }));
      return r && r.status !== 'PENDING' ? r : null;
    });
    expect(deliveryRow.status).toBe('DELIVERED');
  });

  it('a redelivered payment webhook for the same order does not fire a second order.confirmed', async () => {
    const payment = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: checkoutPaymentId } }));
    const before = await prisma.runAsPlatform((tx) => tx.outboundWebhookDelivery.count({ where: { restaurantId, eventType: 'order.confirmed' } }));

    const order = await prisma.runAsPlatform((tx) => tx.order.findUniqueOrThrow({ where: { id: payment.orderId } }));
    // Same link/status but a fresh cf_link_id -> a new WebhookEvent, but the PaymentTransaction
    // is already SUCCESS, so ingestWhatsAppOrderIfNeeded runs again and ingestServerOrder's own
    // dedup makes it a no-op (duplicate: true) -- order.confirmed must not fire a second time.
    await signedWebhook(webhookLinkPayload(payment.providerOrderId, order.totalAmount / 100));

    await new Promise((r) => setTimeout(r, 200)); // give any (wrongly fired) delivery a moment to land
    const after = await prisma.runAsPlatform((tx) => tx.outboundWebhookDelivery.count({ where: { restaurantId, eventType: 'order.confirmed' } }));
    expect(after).toBe(before);
  });

  it('a POS device moving the order to PREPARING fires a real, signed order.status delivery', async () => {
    const synced = await prisma.runAsPlatform((tx) => tx.syncedOrder.findUniqueOrThrow({ where: { restaurantId_externalOrderId: { restaurantId, externalOrderId: syncedExternalOrderId } } }));
    expect(synced.status).toBe('NEW');

    const pushRes = await as('post', '/api/v1/orders/sync', posToken).send({
      events: [
        {
          externalOrderId: syncedExternalOrderId,
          orderType: synced.orderType,
          status: 'PREPARING',
          items: [{ externalItemId: 'pizza-outbound-hooks', name: 'Paneer Pizza', quantity: 1, unitPrice: 24900, modifiers: [], kitchenStatus: 'PREPARING', lineTotal: 24900 }],
          subtotal: synced.subtotal,
          taxAmount: synced.taxAmount,
          totalAmount: synced.totalAmount,
          updatedAt: new Date().toISOString(),
          baseSyncVersion: synced.syncVersion
        }
      ]
    });
    expect(pushRes.status, JSON.stringify(pushRes.body)).toBe(201);
    expect(pushRes.body.results[0].status).toBe('ok');

    const req = await waitUntil(async () => received.find((r) => JSON.parse(r.rawBody).type === 'order.status'));
    const body = JSON.parse(req.rawBody);
    expect(body.restaurantId).toBe(restaurantId);
    expect(body.data.paymentId).toBe(checkoutPaymentId);
    expect(body.data.status).toBe('PREPARING');
    expect(body.data.previousStatus).toBe('NEW');

    // Signature verifies with the real shared secret -- proves this isn't just "fetch was
    // called", the same discipline whatsapp-outbound-webhook.e2e.spec.ts already proved for
    // the service in isolation.
    const timestamp = req.headers['x-timestamp'] as string;
    const signature = req.headers['x-signature'] as string;
    const bodyHash = createHash('sha256').update(req.rawBody).digest('hex');
    expect(signature).toBe(createHmac('sha256', SERVICE_SECRET).update(`POST\n/api/v1/webhooks/jamanvaar/order-event\n${timestamp}\n${bodyHash}`).digest('hex'));
  });

  it('re-pushing the same status again does not fire a second order.status delivery', async () => {
    const synced = await prisma.runAsPlatform((tx) => tx.syncedOrder.findUniqueOrThrow({ where: { restaurantId_externalOrderId: { restaurantId, externalOrderId: syncedExternalOrderId } } }));
    const before = await prisma.runAsPlatform((tx) => tx.outboundWebhookDelivery.count({ where: { restaurantId, eventType: 'order.status' } }));

    await as('post', '/api/v1/orders/sync', posToken).send({
      events: [
        {
          externalOrderId: syncedExternalOrderId,
          orderType: synced.orderType,
          status: 'PREPARING', // unchanged
          items: [{ externalItemId: 'pizza-outbound-hooks', name: 'Paneer Pizza', quantity: 1, unitPrice: 24900, modifiers: [], kitchenStatus: 'PREPARING', lineTotal: 24900 }],
          subtotal: synced.subtotal,
          taxAmount: synced.taxAmount,
          totalAmount: synced.totalAmount,
          updatedAt: new Date().toISOString(),
          baseSyncVersion: synced.syncVersion
        }
      ]
    });

    await new Promise((r) => setTimeout(r, 200));
    const after = await prisma.runAsPlatform((tx) => tx.outboundWebhookDelivery.count({ where: { restaurantId, eventType: 'order.status' } }));
    expect(after).toBe(before);
  });

  it('a POS-sourced (non-WhatsApp) order never fires order.status, whatever its status does', async () => {
    const before = await prisma.runAsPlatform((tx) => tx.outboundWebhookDelivery.count({ where: { restaurantId, eventType: 'order.status' } }));
    const posOrderEvent = {
      externalOrderId: `local-pos-order-${stamp}`,
      orderType: 'DINE_IN',
      status: 'PREPARING',
      tableId: 'table-9',
      tableLabel: 'T9',
      items: [{ externalItemId: 'pizza-outbound-hooks', name: 'Paneer Pizza', quantity: 1, unitPrice: 24900, modifiers: [], kitchenStatus: 'PREPARING', lineTotal: 24900 }],
      subtotal: 24900,
      taxAmount: 0,
      discountAmount: 0,
      totalAmount: 24900,
      updatedAt: new Date().toISOString()
    };
    await as('post', '/api/v1/orders/sync', posToken).send({ events: [posOrderEvent] });
    await as('post', '/api/v1/orders/sync', posToken).send({ events: [{ ...posOrderEvent, status: 'READY' }] });

    await new Promise((r) => setTimeout(r, 200));
    const after = await prisma.runAsPlatform((tx) => tx.outboundWebhookDelivery.count({ where: { restaurantId, eventType: 'order.status' } }));
    expect(after).toBe(before);
  });
});
