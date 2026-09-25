import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationGatewayService } from '../src/modules/notifications/notification-gateway.service';

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

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Receipts Restaurant ${Date.now()}`, ownerName: 'Receipts Owner', ownerEmail: `receipts-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;

    const planRes = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO', name: `TEST Receipts Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { kiosk: true }
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
  });

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
});
