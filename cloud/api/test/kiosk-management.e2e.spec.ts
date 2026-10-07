import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { generateOpaqueToken, hashOpaqueToken } from '../src/common/security/token.util';
import { EmailService } from '../src/modules/notifications/email.service';
import { ReceiptEmailService } from '../src/modules/notifications/receipt-email.service';

describe('Merged kiosk management: configuration and safe remote logout', () => {
  let app: INestApplication; let prisma: PrismaService; let platformToken: string;
  let restaurantId: string; let foreignRestaurantId: string; let planId: string; let branchA: string; let branchB: string;
  let admin: { id: string; token: string }; let kiosk: { id: string; token: string }; let otherBranch: { id: string; token: string };
  const email = `test-kiosk-management-${Date.now()}@example.com`; const password = 'kiosk-management-test-password';
  const authed = (method: 'get' | 'post', url: string, token: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  async function device(type: 'POS_ADMIN' | 'KIOSK', branchId = branchA, tenant = restaurantId) {
    const token = generateOpaqueToken();
    const row = await prisma.runAsPlatform(tx => tx.device.create({ data: { restaurantId: tenant, branchId, type, status: 'ACTIVE', deviceTokenHash: hashOpaqueToken(token) } }));
    return { id: row.id, token };
  }
  const config = (updatedAt = new Date().toISOString()) => ({ branchId: branchA, updatedAt,
    display: { enabledLanguages: ['en', 'hi'], defaultLanguage: 'en', idleWarningAfterSeconds: 90, idleResetCountdownSeconds: 15, accentColor: '#123456', texts: { en: { startOrder: 'Order from my restaurant' } } },
    welcome: { headingText: 'My kiosk', showHeritageArtwork: false, showPromoBanner: true, promoBannerText: 'Welcome!' },
    receipt: { restaurantName: 'Test Cafe', address: 'Test address', phone: '9000000000', gstin: '', fssaiNumber: '', footerMessage: 'Cafe footer', thankYouMessage: 'Visit again', paperSize: '58mm', showCustomerPhone: true, showTaxBreakup: true, showTokenBig: true, enableWhatsApp: false, enableSms: false, enableEmail: true, enableQrReceipt: false }
  });
  const push = (payload: unknown, token = admin.token, externalId = `kiosk-config-${branchA}`) => authed('post', '/api/v1/entity-sync/KIOSK_CONFIGURATION', token).send({ events: [{ externalId, payload }] });
  beforeAll(async () => {
    app = await createTestApp(); prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email, password }); platformToken = (await platformLogin(app, email, password)).body.accessToken;
    const created = await authed('post', '/api/v1/restaurants', platformToken).send({ name: 'TEST Kiosk Management', ownerName: 'Test Owner', ownerEmail: `owner-${email}` });
    expect(created.status).toBe(201); restaurantId = created.body.restaurant.id;
    const foreign = await authed('post', '/api/v1/restaurants', platformToken).send({ name: 'TEST Foreign Kiosk', ownerName: 'Foreign Owner', ownerEmail: `foreign-${email}` }); foreignRestaurantId = foreign.body.restaurant.id;
    const plan = await authed('post', '/api/v1/plans', platformToken).send({ name: `TEST Kiosk Management ${restaurantId}`, tier: 'PRO', productFamily: 'KIOSK', priceMonthly: 100000, maxBranches: 3, maxDevices: 20, maxUsers: 5, entitlements: {} });
    expect(plan.status).toBe(201); planId = plan.body.id;
    expect((await authed('post', '/api/v1/subscriptions', platformToken).send({ restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 86400000).toISOString(), applications: ['KIOSK', 'KIOSK_ADMIN'] })).status).toBe(201);
    const branches = await prisma.runAsPlatform(async tx => {
      const a = await tx.branch.findFirstOrThrow({ where: { restaurantId } });
      const b = await tx.branch.create({ data: { restaurantId, name: 'Other Branch', code: 'B' } });
      return { a, b };
    }); branchA = branches.a.id; branchB = branches.b.id;
    admin = await device('POS_ADMIN'); kiosk = await device('KIOSK'); otherBranch = await device('KIOSK', branchB);
  });
  afterAll(async () => {
    for (const id of [restaurantId, foreignRestaurantId].filter(Boolean)) await prisma.runAsPlatform(tx => tx.restaurant.deleteMany({ where: { id } }));
    if (planId) await prisma.runAsPlatform(tx => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email } }); await app.close();
  });
  it('publishes a kiosk-only console edit that the same branch kiosk can read', async () => {
    const result = await push(config()); expect(result.status).toBe(201); expect(result.body.results[0].status).toBe('ok');
    const read = await authed('get', '/api/v1/entity-sync/KIOSK_CONFIGURATION?afterSeq=0', kiosk.token);
    expect(read.status).toBe(200); expect(read.body.entities[0].payload.receipt.footerMessage).toBe('Cafe footer');
  });
  it('blocks public kiosk writes and another branch reading or overwriting configuration', async () => {
    expect((await push(config(), kiosk.token)).status).toBe(403);
    const read = await authed('get', '/api/v1/entity-sync/KIOSK_CONFIGURATION?afterSeq=0', otherBranch.token); expect(read.body.entities).toEqual([]);
    const result = await push({ ...config(), branchId: branchB }); expect(result.body.results[0].status).toBe('error');
  });
  it('rejects unsafe images and payment policy fields', async () => {
    for (const payload of [{ ...config(), commissionRate: 0 }, { ...config(), display: { ...config().display, logoUrl: 'javascript:alert(1)' } }]) {
      const result = await push(payload); expect(result.body.results[0].status).toBe('error');
    }
  });
  it('preserves a newer edit when an offline console submits an old snapshot', async () => {
    await push({ ...config(new Date(Date.now() + 1000).toISOString()), welcome: { ...config().welcome, headingText: 'Newest heading' } });
    await push({ ...config('2020-01-01T00:00:00.000Z'), welcome: { ...config().welcome, headingText: 'Stale heading' } });
    const read = await authed('get', '/api/v1/entity-sync/KIOSK_CONFIGURATION?afterSeq=0', kiosk.token); expect(read.body.entities[0].payload.welcome.headingText).toBe('Newest heading');
  });
  it('accepts branch welcome designs and a registered same-branch kiosk override', async () => {
    const base = config(new Date(Date.now() + 2000).toISOString());
    const design = { showHeritageArtwork: false, showPromoBanner: false, backgroundId: 'gujarati-thali', backgroundFit: 'cover', backgroundPositionX: 40, backgroundPositionY: 60, backgroundZoom: 1.1, overlayOpacity: 0.2 };
    const response = await push({ ...base, welcome: { ...design, deviceOverrides: { [kiosk.id]: { ...design, backgroundId: 'premium-biryani' } } } });
    expect(response.body.results[0].status).toBe('ok');
    const read = await authed('get', '/api/v1/entity-sync/KIOSK_CONFIGURATION?afterSeq=0', kiosk.token);
    expect(read.body.entities[0].payload.welcome.deviceOverrides[kiosk.id].backgroundId).toBe('premium-biryani');
    const other = await authed('get', '/api/v1/entity-sync/KIOSK_CONFIGURATION?afterSeq=0', otherBranch.token);
    expect(other.body.entities).toEqual([]);
  });
  it('rejects unknown devices, other-branch overrides, non-kiosk targets and incorrect scope ids', async () => {
    const base=config();
    for (const target of ['unknown-kiosk',otherBranch.id,admin.id]) {
      const response=await push({ ...base,welcome:{...base.welcome,deviceOverrides:{[target]:base.welcome}} });
      expect(response.body.results[0].status).toBe('error');
    }
    expect((await push(base,admin.token,'kiosk-config-wrong-scope')).body.results[0].status).toBe('error');
  });
  it('uses this branch receipt settings in the server-built emailed PDF and honours disabled email receipts', async () => {
    const emailService = app.get(EmailService); const configured = vi.spyOn(emailService, 'configured', 'get').mockReturnValue(true);
    const build = vi.spyOn(app.get(ReceiptEmailService) as any, 'buildPdf');
    const externalOrderId = 'qa-kiosk-management-receipt';
    await prisma.runAsTenant(restaurantId, tx => tx.syncedOrder.create({ data: { restaurantId, branchId: branchA, deviceId: kiosk.id, externalOrderId, orderType: 'TAKEAWAY', status: 'NEW', items: [{ name: 'QA Tea', quantity: 1, unitPrice: 10000, lineTotal: 10000 }], subtotal: 10000, taxAmount: 500, totalAmount: 10500, paymentMethod: 'CASH', paymentStatus: 'PENDING' } }));
    try {
      const enabled = { ...config(new Date(Date.now() + 10000).toISOString()), receipt: { ...config().receipt, thankYouMessage: 'Our custom thank-you', footerMessage: 'Our custom footer' } };
      expect((await push(enabled)).body.results[0].status).toBe('ok');
      const result = await authed('post', '/api/v1/receipts/email', kiosk.token).send({ orderId: externalOrderId, email: 'qa-customer@example.invalid' });
      expect(result.status).toBe(201); expect(result.body.success).toBe(true);
      expect(build.mock.calls[0][2]).toMatchObject({ thankYouMessage: 'Our custom thank-you', footerMessage: 'Our custom footer' });
      const attachment = vi.mocked(emailService.send).mock.calls.at(-1)?.[3]?.[0]; expect(attachment?.content.toString().startsWith('%PDF')).toBe(true);
      await push({ ...enabled, updatedAt: new Date(Date.now() + 20000).toISOString(), receipt: { ...enabled.receipt, enableEmail: false } });
      expect((await authed('post', '/api/v1/receipts/email', kiosk.token).send({ orderId: externalOrderId, email: 'qa-customer@example.invalid' })).status).toBe(400);
    } finally { configured.mockRestore(); build.mockRestore(); }
  });
  it('rejects a logout command for another branch or a console', async () => {
    expect((await authed('post', `/api/v1/devices/me/fleet/${otherBranch.id}/commands`, admin.token).send({ commandType: 'FORCE_LOGOUT' })).status).toBe(404);
    expect((await authed('post', `/api/v1/devices/me/fleet/${admin.id}/commands`, admin.token).send({ commandType: 'FORCE_LOGOUT' })).status).toBe(403);
    const b = await prisma.runAsPlatform(tx => tx.branch.findFirstOrThrow({ where: { restaurantId: foreignRestaurantId } }));
    const foreign = await device('KIOSK', b.id, foreignRestaurantId);
    expect((await authed('post', `/api/v1/devices/me/fleet/${foreign.id}/commands`, admin.token).send({ commandType: 'FORCE_LOGOUT' })).status).toBe(404);
  });
  it('keeps a busy kiosk authenticated after a failed logout acknowledgement', async () => {
    const queued = await authed('post', `/api/v1/devices/me/fleet/${kiosk.id}/commands`, admin.token).send({ commandType: 'FORCE_LOGOUT' }); expect(queued.status).toBe(201);
    expect((await authed('post', `/api/v1/devices/me/commands/${queued.body.id}/ack`, kiosk.token).send({ status: 'FAILED', error: 'Payment active' })).status).toBe(201);
    expect((await authed('get', '/api/v1/orders/sync', kiosk.token)).status).toBe(200);
  });
  it('does not repopulate the auth cache with an ACTIVE verdict from a request that started before revocation', async () => {
    const terminal = await device('KIOSK'); const previousTtl = process.env.DEVICE_AUTH_CACHE_MS; process.env.DEVICE_AUTH_CACHE_MS = '10000';
    let release!: () => void; let signalRead!: () => void; let held = false;
    const read = new Promise<void>(resolve => { signalRead = resolve; }); const paused = new Promise<void>(resolve => { release = resolve; });
    const original = prisma.runAsPlatform.bind(prisma);
    const intercepted = vi.spyOn(prisma, 'runAsPlatform').mockImplementation(async (fn: any) => {
      const result: any = await original(fn);
      if (!held && result?.deviceTokenHash === hashOpaqueToken(terminal.token)) { held = true; signalRead(); await paused; }
      return result;
    });
    try {
      const queued = await authed('post', `/api/v1/devices/me/fleet/${terminal.id}/commands`, admin.token).send({ commandType: 'FORCE_LOGOUT' }); expect(queued.status).toBe(201);
      const beforeRevoke = authed('get', '/api/v1/orders/sync', terminal.token).then(response => response);
      await read;
      expect((await authed('post', `/api/v1/devices/me/commands/${queued.body.id}/ack`, terminal.token).send({ status: 'SUCCEEDED' })).status).toBe(201);
      release(); await beforeRevoke; intercepted.mockRestore();
      expect((await authed('get', '/api/v1/orders/sync', terminal.token)).status).toBe(401);
    } finally { release(); intercepted.mockRestore(); if (previousTtl === undefined) delete process.env.DEVICE_AUTH_CACHE_MS; else process.env.DEVICE_AUTH_CACHE_MS = previousTtl; }
  });
  it('queues idempotently, then revokes credentials only after successful kiosk acknowledgement', async () => {
    const previousTtl = process.env.DEVICE_AUTH_CACHE_MS; process.env.DEVICE_AUTH_CACHE_MS = '10000';
    const url = `/api/v1/devices/me/fleet/${kiosk.id}/commands`; const payload = { commandType: 'FORCE_LOGOUT', idempotencyKey: 'logout-once' };
    const queued = await authed('post', url, admin.token).send(payload); expect(queued.status).toBe(201);
    expect((await authed('post', url, admin.token).send(payload)).body.id).toBe(queued.body.id);
    expect((await authed('get', '/api/v1/orders/sync', kiosk.token)).status).toBe(200);
    const pending = await authed('get', '/api/v1/devices/me/commands', kiosk.token); expect(pending.body.some((command: { id: string }) => command.id === queued.body.id)).toBe(true);
    expect((await authed('post', `/api/v1/devices/me/commands/${queued.body.id}/ack`, kiosk.token).send({ status: 'SUCCEEDED', result: { ordersRetained: true } })).status).toBe(201);
    expect((await authed('get', '/api/v1/orders/sync', kiosk.token)).status).toBe(401);
    if (previousTtl === undefined) delete process.env.DEVICE_AUTH_CACHE_MS; else process.env.DEVICE_AUTH_CACHE_MS = previousTtl;
  });
});
