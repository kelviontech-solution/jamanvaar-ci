import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi, type MockInstance } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationGatewayService } from '../src/modules/notifications/notification-gateway.service';
import { EmailService } from '../src/modules/notifications/email.service';

describe('Receipt e-bill delivery', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-receipts-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let kioskToken: string;
  let posToken: string;
  let kdsToken: string;
  let sendWhatsAppMock: ReturnType<typeof vi.fn>;
  let sendSmsMock: ReturnType<typeof vi.fn>;
  let emailSendMock: ReturnType<typeof vi.fn>;
  let emailConfiguredSpy: ReturnType<typeof vi.spyOn>;

  const authed = (method: 'get' | 'post', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    sendWhatsAppMock = vi.fn().mockResolvedValue({ success: true, providerMessageId: 'wamid.mock123' });
    sendSmsMock = vi.fn().mockResolvedValue({ success: true, providerMessageId: 'msg91-mock-req-id' });
    app = await createTestApp((builder) =>
      builder.overrideProvider(NotificationGatewayService).useValue({
        sendWhatsAppTemplate: sendWhatsAppMock,
        sendSms: sendSmsMock
      })
    );
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await platformLogin(app, adminEmail, adminPassword);
    platformToken = loginRes.body.accessToken;

    // createTestApp's own EmailService.send spy (which captures login OTPs) has done its job for
    // this file's one login above — replace it now with one this file's own tests can assert
    // against, same convention as owner-welcome-email.e2e.spec.ts. This test environment has no
    // real SMTP configured, so `configured` is also forced true (the one test that wants it false
    // uses mockReturnValueOnce on this same spy).
    emailSendMock = vi.fn().mockResolvedValue(true);
    vi.spyOn(app.get(EmailService), 'send').mockImplementation(emailSendMock);
    emailConfiguredSpy = vi.spyOn(app.get(EmailService), 'configured', 'get').mockReturnValue(true);

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Receipts Restaurant ${Date.now()}`, ownerName: 'Receipts Owner', ownerEmail: `receipts-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;

    const planRes = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO', name: `TEST Receipts Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { selfOrderKiosk: true }
    });
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId, planId: planRes.body.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      // Phase 5 split Kiosk into its own commercial family — PRO's defaults no longer include it.
      applications: ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN']
    });

    const kioskKeyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'KIOSK', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const kioskRedeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: kioskKeyRes.body.code, deviceType: 'KIOSK' });
    kioskToken = kioskRedeemRes.body.deviceToken;

    const posKeyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const posRedeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: posKeyRes.body.code, deviceType: 'POS' });
    posToken = posRedeemRes.body.deviceToken;

    const kdsKeyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId, allowedDeviceType: 'KDS', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const kdsRedeemRes = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: kdsKeyRes.body.code, deviceType: 'KDS' });
    kdsToken = kdsRedeemRes.body.deviceToken;

    paidOrderId = await seedOnlinePayment('SUCCESS');
    pendingOrderId = await seedOnlinePayment('PENDING');
    cashOrderId = await seedCashOrder('CONFIRMED');
    cancelledCashOrderId = await seedCashOrder('CANCELLED');

    // Creating the restaurant above sent the owner a real welcome email through this same mock —
    // clear that call now so it doesn't count against any test's own assertions.
    emailSendMock.mockClear();
  });

  let paidOrderId: string;
  let pendingOrderId: string;
  let cashOrderId: string;
  let cancelledCashOrderId: string;

  /** An online (Razorpay/UPI) order — lands in Order + PaymentTransaction. Returns the kiosk's own externalOrderId. */
  async function seedOnlinePayment(status: 'SUCCESS' | 'PENDING'): Promise<string> {
    const externalOrderId = `receipt-email-${status}-${Date.now()}-${Math.random()}`;
    const order = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({
        data: {
          restaurantId,
          externalOrderId,
          items: [{ externalItemId: 'itm-1', name: 'Paneer Tikka', quantity: 2, unitPrice: 25000, lineTotal: 50000 }],
          subtotal: 50000,
          taxAmount: 2500,
          totalAmount: 52500,
          status: status === 'SUCCESS' ? 'PAID' : 'PENDING_PAYMENT'
        }
      })
    );
    await prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({
        data: {
          orderId: order.id,
          restaurantId,
          providerOrderId: `pay_receipt_${status}_${Date.now()}_${Math.random()}`,
          amount: 52500,
          status,
          paidAt: status === 'SUCCESS' ? new Date() : null,
          method: status === 'SUCCESS' ? 'UPI' : null
        }
      })
    );
    return externalOrderId;
  }

  /** A cash-at-counter order — never touches Order/PaymentTransaction, only the generic order-sync mirror. */
  async function seedCashOrder(status: 'CONFIRMED' | 'CANCELLED'): Promise<string> {
    const externalOrderId = `receipt-email-cash-${status}-${Date.now()}-${Math.random()}`;
    await prisma.runAsTenant(restaurantId, (tx) =>
      tx.syncedOrder.create({
        data: {
          restaurantId,
          externalOrderId,
          orderType: 'TOKEN_QR',
          status,
          items: [{ externalItemId: 'itm-1', name: 'Masala Dosa', quantity: 1, unitPrice: 15000, lineTotal: 15000 }],
          subtotal: 15000,
          taxAmount: 750,
          totalAmount: 15750,
          paymentMethod: 'CASH_AT_COUNTER',
          paymentStatus: 'PENDING',
          source: 'KIOSK'
        }
      })
    );
    return externalOrderId;
  }

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('a KIOSK device can send a WhatsApp receipt', async () => {
    const res = await authed('post', '/api/v1/receipts/send', kioskToken).send({
      channel: 'WHATSAPP', phoneNumber: '9876543210', templateParams: ['ORD-1', '108', 'Rs. 252.00']
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, providerMessageId: 'wamid.mock123' });
    expect(sendWhatsAppMock).toHaveBeenCalledWith({ phoneNumber: '9876543210', templateParams: ['ORD-1', '108', 'Rs. 252.00'] });
  });

  it('a POS device can send an SMS receipt', async () => {
    const res = await authed('post', '/api/v1/receipts/send', posToken).send({
      channel: 'SMS', phoneNumber: '9876543210', templateParams: ['ORD-2', '109', 'Rs. 100.00']
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, providerMessageId: 'msg91-mock-req-id' });
  });

  it('rejects an invalid phone number before calling the gateway', async () => {
    const res = await authed('post', '/api/v1/receipts/send', kioskToken).send({
      channel: 'WHATSAPP', phoneNumber: '12345', templateParams: ['ORD-3', '110', 'Rs. 50.00']
    });
    expect(res.status).toBe(400);
  });

  it('a KDS device cannot send a receipt (403)', async () => {
    const res = await authed('post', '/api/v1/receipts/send', kdsToken).send({
      channel: 'WHATSAPP', phoneNumber: '9876543210', templateParams: ['ORD-4', '111', 'Rs. 75.00']
    });
    expect(res.status).toBe(403);
  });

  it('a gateway rejection surfaces as 200 with success:false, not a 500', async () => {
    sendWhatsAppMock.mockResolvedValueOnce({ success: false, errorMessage: 'Template not approved' });
    const res = await authed('post', '/api/v1/receipts/send', kioskToken).send({
      channel: 'WHATSAPP', phoneNumber: '9876543210', templateParams: ['ORD-5', '112', 'Rs. 90.00']
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: false, errorMessage: 'Template not approved' });
  });

  it('no device token at all is rejected 401', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/receipts/send').send({
      channel: 'WHATSAPP', phoneNumber: '9876543210', templateParams: ['ORD-6', '113', 'Rs. 60.00']
    });
    expect(res.status).toBe(401);
  });

  describe('Email bill (PDF invoice)', () => {
    beforeEach(() => {
      emailSendMock.mockClear();
    });

    it('a KIOSK device can email a real, paid online order as a PDF invoice', async () => {
      const res = await authed('post', '/api/v1/receipts/email', kioskToken).send({ orderId: paidOrderId, email: 'Guest@Example.com' });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ success: true });

      expect(emailSendMock).toHaveBeenCalledTimes(1);
      const [to, subject, html, attachments] = emailSendMock.mock.calls[0];
      // the schema lower-cases the address — never trusts the exact casing the guest typed
      expect(to).toBe('guest@example.com');
      expect(subject).toContain('Order');
      expect(html).toContain('TEST Receipts Restaurant');
      expect(attachments).toHaveLength(1);
      expect(attachments[0].contentType).toBe('application/pdf');
      expect(attachments[0].content).toBeInstanceOf(Buffer);
      expect(attachments[0].content.length).toBeGreaterThan(500);
      // a real PDF file signature, not just any buffer
      expect(attachments[0].content.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('the email body itself is a real message with the bill in it — what was ordered and what it came to — not just "see attached"', async () => {
      const res = await authed('post', '/api/v1/receipts/email', kioskToken).send({ orderId: paidOrderId, email: 'guest@example.com' });
      expect(res.status).toBe(201);

      const [, , html] = emailSendMock.mock.calls[0];
      expect(html).toContain('Thank you for dining with TEST Receipts Restaurant');
      // the item and its amount, correctly converted from paise (50000 paise = ₹500.00) — not the raw paise figure
      expect(html).toContain('Paneer Tikka');
      expect(html).toContain('× 2');
      expect(html).toContain('₹500.00');
      expect(html).not.toContain('₹50000');
      // the order's total (52500 paise = ₹525.00), also correctly converted
      expect(html).toContain('Total Paid');
      expect(html).toContain('₹525.00');
      expect(html).not.toContain('₹52500');
      expect(html).toContain('attached to this email as a PDF');
      expect(html).toContain('We hope to serve you again soon');
    });

    it('a cash-at-counter order (no online payment at all) can also be emailed as a PDF bill', async () => {
      const res = await authed('post', '/api/v1/receipts/email', kioskToken).send({ orderId: cashOrderId, email: 'guest@example.com' });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ success: true });

      expect(emailSendMock).toHaveBeenCalledTimes(1);
      const [, , , attachments] = emailSendMock.mock.calls[0];
      expect(attachments[0].content.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('rejects a malformed email address before building anything', async () => {
      const res = await authed('post', '/api/v1/receipts/email', kioskToken).send({ orderId: paidOrderId, email: 'not-an-email' });
      expect(res.status).toBe(400);
      expect(emailSendMock).not.toHaveBeenCalled();
    });

    it('404s for an order id that does not exist (online or cash)', async () => {
      const res = await authed('post', '/api/v1/receipts/email', kioskToken).send({ orderId: 'no-such-order', email: 'guest@example.com' });
      expect(res.status).toBe(404);
    });

    it('refuses to email an invoice for an online order that never paid', async () => {
      const res = await authed('post', '/api/v1/receipts/email', kioskToken).send({ orderId: pendingOrderId, email: 'guest@example.com' });
      expect(res.status).toBe(400);
      expect(emailSendMock).not.toHaveBeenCalled();
    });

    it('refuses to email an invoice for a cancelled cash order', async () => {
      const res = await authed('post', '/api/v1/receipts/email', kioskToken).send({ orderId: cancelledCashOrderId, email: 'guest@example.com' });
      expect(res.status).toBe(400);
      expect(emailSendMock).not.toHaveBeenCalled();
    });

    it('a KDS device cannot email a bill (403)', async () => {
      const res = await authed('post', '/api/v1/receipts/email', kdsToken).send({ orderId: paidOrderId, email: 'guest@example.com' });
      expect(res.status).toBe(403);
    });

    it('surfaces 503 when SMTP is not configured on this server', async () => {
      emailConfiguredSpy.mockReturnValueOnce(false);
      const res = await authed('post', '/api/v1/receipts/email', kioskToken).send({ orderId: paidOrderId, email: 'guest@example.com' });
      expect(res.status).toBe(503);
    });

    it('no device token at all is rejected 401', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/receipts/email').send({ orderId: paidOrderId, email: 'guest@example.com' });
      expect(res.status).toBe(401);
    });
  });

  describe('WhatsApp bill (via the WhatsApp service)', () => {
    let fetchSpy: MockInstance<typeof fetch>;
    const waSecret = 'dev-only-jamanvaar-whatsapp-shared-secret-change-in-prod';

    beforeEach(() => {
      process.env.WHATSAPP_CONNECTOR_BASE_URL = 'http://wa.test';
      process.env.JAMANVAAR_SERVICE_SECRET = waSecret;
      // Only the outbound call to the WhatsApp service is faked; supertest's own traffic goes via http, not global fetch.
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true, via: 'text' }), { status: 200 }));
    });

    afterAll(() => fetchSpy?.mockRestore());

    const send = (token: string, orderId: string, phone: string) => authed('post', '/api/v1/receipts/whatsapp', token).send({ orderId, phone });

    it('sends a cash-at-counter bill, built server-side from the real order, signed for the WhatsApp service', async () => {
      const res = await send(posToken, cashOrderId, '+91 98765 43210');
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ success: true });
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://wa.test/api/v1/webhooks/jamanvaar/send-bill');
      const body = JSON.parse(init.body as string);
      expect(body.restaurantId).toBe(restaurantId);
      expect(body.phone).toBe('9876543210');
      expect(body.billText).toContain('Masala Dosa');
      expect(body.billText).toContain('₹157.50'); // 15750 paise
      expect(body.templateParams[2]).toBe('₹157.50');
      const headers = init.headers as Record<string, string>;
      const { createHash, createHmac } = await import('crypto');
      const expected = createHmac('sha256', waSecret)
        .update(`POST\n/api/v1/webhooks/jamanvaar/send-bill\n${headers['X-Timestamp']}\n${createHash('sha256').update(init.body as string).digest('hex')}`)
        .digest('hex');
      expect(headers['X-Signature']).toBe(expected);
    });

    it('sends a bill for a paid online order from the kiosk', async () => {
      const res = await send(kioskToken, paidOrderId, '9876543210');
      expect(res.status).toBe(201);
      expect(JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string).billText).toContain('Paneer Tikka');
    });

    it('rejects letters / short / non-Indian numbers before calling anything', async () => {
      for (const phone of ['kje5465', '12345', '5876543210', '98765abcde']) {
        expect((await send(kioskToken, cashOrderId, phone)).status).toBe(400);
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('passes the WhatsApp service\'s own failure reason back instead of a 500', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ success: false, errorMessage: 'no template' }), { status: 200 }));
      const res = await send(kioskToken, cashOrderId, '9876543210');
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ success: false, errorMessage: 'no template' });
    });

    it('503s when the WhatsApp service is unreachable', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      expect((await send(kioskToken, cashOrderId, '9876543210')).status).toBe(503);
    });

    it('refuses when the restaurant has switched WhatsApp bills off, and works again when switched back on', async () => {
      const kioskDevice = await prisma.runAsTenant(restaurantId, (tx) => tx.device.findFirst({ where: { restaurantId, type: 'KIOSK' } }));
      const branch = kioskDevice!.branchId!;
      const externalId = `kiosk-config-${branch}`;
      const config = (enableWhatsApp: boolean, branchId?: string) => ({
        branchId,
        updatedAt: new Date().toISOString(),
        display: { enabledLanguages: ['en'], defaultLanguage: 'en', idleWarningAfterSeconds: 30, idleResetCountdownSeconds: 10 },
        welcome: { showHeritageArtwork: false, showPromoBanner: false },
        receipt: {
          restaurantName: 'R', address: 'A', phone: '1', gstin: 'G', fssaiNumber: 'F', footerMessage: 'f', thankYouMessage: 't', paperSize: '80mm',
          showCustomerPhone: true, showTaxBreakup: true, showTokenBig: true, enableWhatsApp, enableSms: true, enableEmail: true, enableQrReceipt: true
        }
      });
      const save = (enableWhatsApp: boolean) =>
        prisma.runAsTenant(restaurantId, (tx) =>
          tx.syncedEntity.upsert({
            where: { restaurantId_entityType_externalId: { restaurantId, entityType: 'KIOSK_CONFIGURATION', externalId } },
            create: { restaurantId, entityType: 'KIOSK_CONFIGURATION', externalId, payload: config(enableWhatsApp, branch) },
            update: { payload: config(enableWhatsApp, branch) }
          })
        );
      try {
        await save(false);
        const off = await send(kioskToken, cashOrderId, '9876543210');
        expect(off.status).toBe(400);
        expect(off.body.message).toMatch(/turned off/i);
        expect(fetchSpy).not.toHaveBeenCalled();
        await save(true);
        expect((await send(kioskToken, cashOrderId, '9876543210')).status).toBe(201);
      } finally {
        await prisma.runAsTenant(restaurantId, (tx) => tx.syncedEntity.deleteMany({ where: { restaurantId, entityType: 'KIOSK_CONFIGURATION' } }));
      }
    });

    it('a customer asking for the same bill twice just gets it twice (idempotent, no state change)', async () => {
      expect((await send(kioskToken, cashOrderId, '9876543210')).status).toBe(201);
      expect((await send(kioskToken, cashOrderId, '9876543210')).status).toBe(201);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('refuses unpaid online orders and cancelled cash orders, unknown orders 404, KDS 403', async () => {
      expect((await send(kioskToken, pendingOrderId, '9876543210')).status).toBe(400);
      expect((await send(kioskToken, cancelledCashOrderId, '9876543210')).status).toBe(400);
      expect((await send(kioskToken, 'no-such-order', '9876543210')).status).toBe(404);
      expect((await send(kdsToken, cashOrderId, '9876543210')).status).toBe(403);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
