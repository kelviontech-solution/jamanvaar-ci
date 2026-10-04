import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { CashfreeGatewayService } from '../src/modules/payments/cashfree-gateway.service';

const APPS = ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN'];

describe('Kiosk QR payment flow: QR, fulfilment, attention, refunds, statement, settle-now', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-kflow-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  let kioskToken: string;
  let kioskAdminToken: string;
  let posAdminToken: string;
  let posToken: string;
  let gateway: { createOrder: ReturnType<typeof vi.fn>; createUpiQr: ReturnType<typeof vi.fn>; createRefund: ReturnType<typeof vi.fn>; settleVendorOnDemand: ReturnType<typeof vi.fn> };

  const authed = (method: 'get' | 'post' | 'patch', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  const thali = { externalItemId: 'thali-1', name: 'Thali', basePrice: 10000, taxRate: 0, modifierGroups: [] };
  const lines = [{ externalItemId: 'thali-1', quantity: 1, selectedOptionIds: [] }];

  const deviceFor = async (rid: string, type: string) => {
    const keyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId: rid, allowedDeviceType: type, expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const redeem = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: keyRes.body.code, deviceType: type });
    return redeem.body.deviceToken as string;
  };

  const seedPayment = async (rid: string, opts: { amount: number; bps?: number; status?: string; paidAt?: Date; fulfilled?: boolean; providerOrderId?: string }) => {
    const bps = opts.bps ?? 0;
    const platformAmount = Math.round((opts.amount * bps) / 10000);
    const order = await prisma.runAsTenant(rid, (tx) =>
      tx.order.create({ data: { restaurantId: rid, externalOrderId: `kf-${Date.now()}-${Math.random()}`, items: [], subtotal: opts.amount, taxAmount: 0, totalAmount: opts.amount, status: 'PAID' } })
    );
    return prisma.runAsTenant(rid, (tx) =>
      tx.paymentTransaction.create({
        data: {
          orderId: order.id, restaurantId: rid, providerOrderId: opts.providerOrderId ?? `pay_kf_${Date.now()}_${Math.random()}`, amount: opts.amount, currency: 'INR',
          status: (opts.status ?? 'SUCCESS') as never, paidAt: opts.paidAt ?? new Date(), commissionBps: bps, platformAmount, restaurantAmount: opts.amount - platformAmount,
          fulfilledAt: opts.fulfilled ? new Date() : null
        }
      })
    );
  };

  beforeAll(async () => {
    gateway = {
      createOrder: vi.fn().mockResolvedValue({ cfOrderId: 'cf_1', orderId: 'pay_mock', paymentSessionId: 'session_mock', orderStatus: 'ACTIVE' }),
      createUpiQr: vi.fn().mockResolvedValue({ qrPayload: 'BASE64QR', contentType: 'image/png', cfPaymentId: 'cfp_1' }),
      createRefund: vi.fn().mockResolvedValue({ cfRefundId: 'cf_refund_1', refundId: 'r1', refundStatus: 'PENDING', refundAmount: 100 }),
      settleVendorOnDemand: vi.fn().mockResolvedValue({ settlementId: '555', raw: {} })
    };
    app = await createTestApp((builder) => builder.overrideProvider(CashfreeGatewayService).useValue({ isConfigured: () => true, ...gateway }));
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    platformToken = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Kiosk Flow ${Date.now()}`, ownerName: 'Flow Owner', ownerEmail: `kflow-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;
    const planRes = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO', name: `TEST Kflow Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { selfOrderKiosk: true }
    });
    planId = planRes.body.id;
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), applications: APPS
    });
    kioskToken = await deviceFor(restaurantId, 'KIOSK');
    kioskAdminToken = await deviceFor(restaurantId, 'KIOSK_ADMIN');
    posAdminToken = await deviceFor(restaurantId, 'POS_ADMIN');
    posToken = await deviceFor(restaurantId, 'POS');

    await prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.create({ data: { restaurantId, status: 'ACTIVE', cashfreeVendorId: 'rest_kflow_vendor' } }));
    await prisma.runAsTenant(restaurantId, (tx) =>
      tx.menuSnapshotItem.upsert({
        where: { restaurantId_externalItemId: { restaurantId, externalItemId: 'thali-1' } },
        create: { restaurantId, ...thali },
        update: { ...thali }
      })
    );
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.platformSetting.deleteMany({ where: { key: 'PAYMENT_DEFAULT_COMMISSION_BPS' } }));
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  const createKioskOrder = async (externalOrderId: string) => {
    const res = await authed('post', '/api/v1/payments/orders', kioskToken).send({ externalOrderId, lines });
    expect(res.status).toBe(201);
    return res.body as { paymentId: string; orderId: string; amount: number };
  };

  // ---------------- QR ----------------

  it('a kiosk gets a UPI QR for its own pending payment, with a 3 minute expiry sent to Cashfree', async () => {
    const order = await createKioskOrder('kf-qr-1');
    gateway.createUpiQr.mockClear();
    const before = Date.now();
    const res = await authed('post', `/api/v1/payments/${order.paymentId}/qr`, kioskToken);
    expect(res.status).toBe(201);
    expect(res.body.qrPayload).toBe('BASE64QR');
    expect(res.body.contentType).toBe('image/png');
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(before + 170_000);
    expect(new Date(res.body.expiresAt).getTime()).toBeLessThan(before + 200_000);
    expect(gateway.createUpiQr).toHaveBeenCalledWith('session_mock', expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
  });

  it('QR is refused for a POS device, another restaurant, an unknown payment, and a payment that is no longer pending', async () => {
    const order = await createKioskOrder('kf-qr-2');
    expect((await authed('post', `/api/v1/payments/${order.paymentId}/qr`, posToken)).status).toBe(403);
    expect((await authed('post', `/api/v1/payments/${order.paymentId}/qr`, posAdminToken)).status).toBe(403);
    expect((await authed('post', '/api/v1/payments/00000000-0000-0000-0000-000000000000/qr', kioskToken)).status).toBe(404);

    const otherRes = await authed('post', '/api/v1/restaurants', platformToken).send({ name: `TEST Kflow Other ${Date.now()}`, ownerName: 'Other Owner', ownerEmail: `kflow-other-${Date.now()}@test.example.com` });
    const otherId = otherRes.body.restaurant.id;
    await authed('post', '/api/v1/subscriptions', platformToken).send({ restaurantId: otherId, planId, status: 'ACTIVE', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), applications: APPS });
    const otherKiosk = await deviceFor(otherId, 'KIOSK');
    expect((await authed('post', `/api/v1/payments/${order.paymentId}/qr`, otherKiosk)).status).toBe(404);
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: otherId } }));

    await prisma.runAsPlatform((tx) => tx.paymentTransaction.update({ where: { id: order.paymentId }, data: { status: 'SUCCESS' } }));
    expect((await authed('post', `/api/v1/payments/${order.paymentId}/qr`, kioskToken)).status).toBe(400);
  });

  it('QR is refused while the restaurant payment connection is suspended', async () => {
    const order = await createKioskOrder('kf-qr-3');
    await prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.update({ where: { restaurantId }, data: { status: 'SUSPENDED' } }));
    const res = await authed('post', `/api/v1/payments/${order.paymentId}/qr`, kioskToken);
    expect(res.status).toBe(403);
    await prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.update({ where: { restaurantId }, data: { status: 'ACTIVE' } }));
  });

  it('a Cashfree failure while creating the QR surfaces as 503 and leaves the payment untouched', async () => {
    const order = await createKioskOrder('kf-qr-4');
    gateway.createUpiQr.mockRejectedValueOnce(new (await import('@nestjs/common')).ServiceUnavailableException('Cashfree down'));
    const res = await authed('post', `/api/v1/payments/${order.paymentId}/qr`, kioskToken);
    expect(res.status).toBe(503);
    const row = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: order.paymentId } }));
    expect(row.status).toBe('PENDING');
  });

  // ---------------- QR fallback: the account is not approved for server-to-server UPI QR ----------------

  describe('when Cashfree has not approved the server-to-server UPI QR', () => {
    const notApproved = async () => new (await import('../src/modules/payments/cashfree-gateway.service')).CashfreeFeatureNotEnabledException('POST/orders/pay is not enabled or approved');
    const base = 'https://pay.example.test';

    it('the QR carries the address of our payment page instead, and says how to scan it', async () => {
      process.env.PAYMENT_PAGE_BASE_URL = base;
      try {
        const order = await createKioskOrder('kf-fb-1');
        gateway.createUpiQr.mockRejectedValueOnce(await notApproved());
        const res = await authed('post', `/api/v1/payments/${order.paymentId}/qr`, kioskToken);
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ qrPayload: `${base}/api/v1/pay/${order.paymentId}`, contentType: 'text/uri-list', method: 'CHECKOUT_PAGE' });
        // the normal path still says it is a UPI QR
        const normal = await authed('post', `/api/v1/payments/${(await createKioskOrder('kf-fb-2')).paymentId}/qr`, kioskToken);
        expect(normal.body.method).toBe('UPI_QR');
      } finally {
        delete process.env.PAYMENT_PAGE_BASE_URL;
      }
    });

    it('with no public address configured there is nothing to point the QR at, so it stays a 503', async () => {
      const saved = { page: process.env.PAYMENT_PAGE_BASE_URL, notify: process.env.CASHFREE_WEBHOOK_NOTIFY_URL };
      process.env.PAYMENT_PAGE_BASE_URL = '';
      process.env.CASHFREE_WEBHOOK_NOTIFY_URL = '';
      try {
        const order = await createKioskOrder('kf-fb-3');
        gateway.createUpiQr.mockRejectedValueOnce(await notApproved());
        expect((await authed('post', `/api/v1/payments/${order.paymentId}/qr`, kioskToken)).status).toBe(503);
      } finally {
        if (saved.page === undefined) delete process.env.PAYMENT_PAGE_BASE_URL; else process.env.PAYMENT_PAGE_BASE_URL = saved.page;
        if (saved.notify === undefined) delete process.env.CASHFREE_WEBHOOK_NOTIFY_URL; else process.env.CASHFREE_WEBHOOK_NOTIFY_URL = saved.notify;
      }
    });

    it('the payment page shows the restaurant and amount, hands Cashfree the session, and needs no login', async () => {
      const order = await createKioskOrder('kf-fb-4');
      const res = await request(app.getHttpServer()).get(`/api/v1/pay/${order.paymentId}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.text).toContain('₹100.00');
      expect(res.text).toContain('"session_mock"');
      expect(res.text).toContain('sdk.cashfree.com');
    });

    it('the page says "received" once paid, and is closed for unknown, malformed, expired, suspended and cancelled payments', async () => {
      const order = await createKioskOrder('kf-fb-5');
      expect((await request(app.getHttpServer()).get('/api/v1/pay/00000000-0000-0000-0000-000000000000')).status).toBe(410);
      expect((await request(app.getHttpServer()).get('/api/v1/pay/not-an-id')).status).toBe(410);

      await prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.update({ where: { restaurantId }, data: { status: 'SUSPENDED' } }));
      const suspended = await request(app.getHttpServer()).get(`/api/v1/pay/${order.paymentId}`);
      expect(suspended.status).toBe(410);
      expect(suspended.text).not.toContain('sdk.cashfree.com');
      await prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.update({ where: { restaurantId }, data: { status: 'ACTIVE' } }));

      await prisma.runAsPlatform((tx) => tx.paymentTransaction.update({ where: { id: order.paymentId }, data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) } }));
      expect((await request(app.getHttpServer()).get(`/api/v1/pay/${order.paymentId}`)).status).toBe(410);
      await prisma.runAsPlatform((tx) => tx.paymentTransaction.update({ where: { id: order.paymentId }, data: { createdAt: new Date(), status: 'FAILED' } }));
      expect((await request(app.getHttpServer()).get(`/api/v1/pay/${order.paymentId}`)).status).toBe(410);

      await prisma.runAsPlatform((tx) => tx.paymentTransaction.update({ where: { id: order.paymentId }, data: { status: 'SUCCESS', paidAt: new Date() } }));
      const paid = await request(app.getHttpServer()).get(`/api/v1/pay/${order.paymentId}`);
      expect(paid.status).toBe(200);
      expect(paid.text).toContain('Payment received');
      expect(paid.text).not.toContain('sdk.cashfree.com');
    });
  });

  // ---------------- Fulfilment ----------------

  it('a kiosk can only mark a payment fulfilled once it has really succeeded, and doing it twice is harmless', async () => {
    const order = await createKioskOrder('kf-ful-1');
    expect((await authed('post', `/api/v1/payments/${order.paymentId}/fulfilled`, kioskToken)).status).toBe(400);

    await prisma.runAsPlatform((tx) => tx.paymentTransaction.update({ where: { id: order.paymentId }, data: { status: 'SUCCESS', paidAt: new Date() } }));
    const first = await authed('post', `/api/v1/payments/${order.paymentId}/fulfilled`, kioskToken);
    expect(first.status).toBe(201);
    const row1 = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: order.paymentId } }));
    expect(row1.fulfilledAt).not.toBeNull();
    const firstStamp = row1.fulfilledAt!.getTime();

    const second = await authed('post', `/api/v1/payments/${order.paymentId}/fulfilled`, kioskToken);
    expect(second.status).toBe(201);
    const row2 = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: order.paymentId } }));
    expect(row2.fulfilledAt!.getTime()).toBe(firstStamp);
  });

  it('a POS (cashier) device cannot mark payments fulfilled', async () => {
    const p = await seedPayment(restaurantId, { amount: 1000 });
    expect((await authed('post', `/api/v1/payments/${p.id}/fulfilled`, posToken)).status).toBe(403);
  });

  // ---------------- Tenant recent / attention ----------------

  it('Kiosk Admin sees recent payments and which paid ones need attention (paid > 3 min ago, never fulfilled)', async () => {
    const stale = await seedPayment(restaurantId, { amount: 4200, paidAt: new Date(Date.now() - 10 * 60_000), fulfilled: false });
    const fresh = await seedPayment(restaurantId, { amount: 4300, paidAt: new Date(Date.now() - 30_000), fulfilled: false });
    const done = await seedPayment(restaurantId, { amount: 4400, paidAt: new Date(Date.now() - 10 * 60_000), fulfilled: true });

    const res = await authed('get', '/api/v1/payments/tenant-recent', kioskAdminToken);
    expect(res.status).toBe(200);
    const byId = (id: string) => res.body.rows.find((r: { id: string }) => r.id === id);
    expect(byId(stale.id).needsAttention).toBe(true);
    expect(byId(fresh.id).needsAttention).toBe(false);
    expect(byId(done.id).needsAttention).toBe(false);
    expect(byId(stale.id)).toMatchObject({ amount: 4200, refundedAmount: 0, refundableAmount: 4200 });
  });

  it('tenant-recent is closed to a plain kiosk and a cashier POS, and only shows the caller\'s own restaurant', async () => {
    expect((await authed('get', '/api/v1/payments/tenant-recent', kioskToken)).status).toBe(403);
    expect((await authed('get', '/api/v1/payments/tenant-recent', posToken)).status).toBe(403);
  });

  it('staff can mark a stuck payment fulfilled from Kiosk Admin, which clears the attention flag', async () => {
    const stale = await seedPayment(restaurantId, { amount: 4500, paidAt: new Date(Date.now() - 10 * 60_000) });
    expect((await authed('post', `/api/v1/payments/${stale.id}/fulfilled`, kioskAdminToken)).status).toBe(201);
    const res = await authed('get', '/api/v1/payments/tenant-recent', kioskAdminToken);
    expect(res.body.rows.find((r: { id: string }) => r.id === stale.id).needsAttention).toBe(false);
  });

  // ---------------- Refunds ----------------

  it('a Kiosk Admin device can refund an online payment (POS and POS Admin already could)', async () => {
    const p = await seedPayment(restaurantId, { amount: 10000, fulfilled: true });
    const res = await authed('post', `/api/v1/payments/${p.id}/refund`, kioskAdminToken).send({ amountPaise: 2500, reason: 'wrong dish', requestedBy: 'Owner' });
    expect(res.status).toBe(201);
    expect(gateway.createRefund).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 2500, orderId: p.providerOrderId }));
    // a plain kiosk (customer-facing) still can not
    const denied = await authed('post', `/api/v1/payments/${p.id}/refund`, kioskToken).send({ amountPaise: 100, reason: 'x', requestedBy: 'x' });
    expect(denied.status).toBe(403);
  });

  // ---------------- Platform attention + admin refund ----------------

  it('Super Admin sees payments needing attention across restaurants', async () => {
    const stale = await seedPayment(restaurantId, { amount: 4600, paidAt: new Date(Date.now() - 20 * 60_000) });
    const res = await authed('get', '/api/v1/payments/attention', platformToken);
    expect(res.status).toBe(200);
    const row = res.body.rows.find((r: { id: string }) => r.id === stale.id);
    expect(row).toBeDefined();
    expect(row.restaurant.name).toContain('TEST Kiosk Flow');
    expect(row.minutesWaiting).toBeGreaterThanOrEqual(19);
  });

  it('Super Admin refund requires the admin password, respects the refundable balance, and is audited', async () => {
    const p = await seedPayment(restaurantId, { amount: 10000, fulfilled: true });
    const url = `/api/v1/payments/${p.id}/admin-refund`;
    expect((await authed('post', url, platformToken).send({ amountPaise: 1000, reason: 'goodwill' })).status).toBe(403);
    expect((await authed('post', url, platformToken).send({ amountPaise: 1000, reason: 'goodwill', password: 'wrong' })).status).toBe(403);
    expect((await authed('post', url, platformToken).send({ amountPaise: 99999, reason: 'too much', password: adminPassword })).status).toBe(400);

    gateway.createRefund.mockClear();
    const ok = await authed('post', url, platformToken).send({ amountPaise: 1000, reason: 'goodwill', password: adminPassword });
    expect(ok.status).toBe(201);
    expect(gateway.createRefund).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 1000 }));
    const audit = await prisma.runAsPlatform((tx) => tx.auditLog.findFirst({ where: { action: 'REFUND_REQUESTED', restaurantId }, orderBy: { createdAt: 'desc' } }));
    expect(audit).not.toBeNull();
    expect(audit!.actorType).toBe('PLATFORM');
  });

  it('a READ_ONLY platform user can neither see the write action nor use it', async () => {
    const email = `test-kflow-ro-${Date.now()}@example.com`;
    await createTestPlatformUser(prisma, { email, password: adminPassword, role: 'READ_ONLY' });
    const token = (await platformLogin(app, email, adminPassword)).body.accessToken;
    const p = await seedPayment(restaurantId, { amount: 2000, fulfilled: true });
    expect((await authed('get', '/api/v1/payments/attention', token)).status).toBe(200);
    expect((await authed('post', `/api/v1/payments/${p.id}/admin-refund`, token).send({ amountPaise: 100, reason: 'x', password: adminPassword })).status).toBe(403);
    await prisma.platformUser.deleteMany({ where: { email } });
  });

  // ---------------- Statement ----------------

  const jan15 = new Date('2026-01-15T10:00:00+05:30');

  it('the day statement adds up gross, commission, refunds and the restaurant net using the original split', async () => {
    const a = await seedPayment(restaurantId, { amount: 10000, bps: 200, paidAt: jan15, fulfilled: true }); // platform 200, restaurant 9800
    await seedPayment(restaurantId, { amount: 5000, bps: 300, paidAt: jan15, fulfilled: true }); // platform 150, restaurant 4850
    await prisma.runAsTenant(restaurantId, (tx) =>
      tx.refund.create({ data: { paymentId: a.id, restaurantId, amount: 4000, status: 'SUCCESS', processedAt: jan15 } })
    );
    // an unrelated day must not leak in
    await seedPayment(restaurantId, { amount: 7777, bps: 0, paidAt: new Date('2026-01-16T10:00:00+05:30'), fulfilled: true });

    for (const res of [
      await authed('get', '/api/v1/payments/tenant-statement?date=2026-01-15', kioskAdminToken),
      await authed('get', `/api/v1/payments/statement?restaurantId=${restaurantId}&date=2026-01-15`, platformToken)
    ]) {
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        date: '2026-01-15',
        paymentCount: 2,
        refundCount: 1,
        grossVolume: 15000,
        refundedAmount: 4000,
        platformCommission: 350,
        cashfreeFee: 300,
        platformNetCommission: 50,
        commissionReversed: 80,
        restaurantGross: 14650,
        restaurantRefundImpact: 3920,
        netPayableToRestaurant: 10730
      });
      expect(res.body.rows.length).toBe(2);
    }
  });

  it('a statement for a day with nothing is all zeros, and a malformed date is rejected', async () => {
    const empty = await authed('get', '/api/v1/payments/tenant-statement?date=2025-03-01', kioskAdminToken);
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({ paymentCount: 0, grossVolume: 0, netPayableToRestaurant: 0 });
    expect((await authed('get', '/api/v1/payments/tenant-statement?date=15-01-2026', kioskAdminToken)).status).toBe(400);
    expect((await authed('get', '/api/v1/payments/tenant-statement', kioskAdminToken)).status).toBe(400);
    expect((await authed('get', '/api/v1/payments/tenant-statement?date=2026-01-15', kioskToken)).status).toBe(403);
  });

  // ---------------- Settle now ----------------

  it('Settle now requires the admin password, a vendor, and an amount of at least Rs. 10, then audits the settlement id', async () => {
    const url = `/api/v1/restaurants/${restaurantId}/payment-connection/settle-now`;
    expect((await authed('post', url, platformToken).send({ amountPaise: 500000 })).status).toBe(403);
    expect((await authed('post', url, platformToken).send({ amountPaise: 500000, password: 'wrong' })).status).toBe(403);
    expect((await authed('post', url, platformToken).send({ amountPaise: 500, password: adminPassword })).status).toBe(400);

    gateway.settleVendorOnDemand.mockClear();
    const ok = await authed('post', url, platformToken).send({ amountPaise: 500000, password: adminPassword });
    expect(ok.status).toBe(201);
    expect(ok.body.settlementId).toBe('555');
    expect(gateway.settleVendorOnDemand).toHaveBeenCalledWith('rest_kflow_vendor', 500000, expect.any(String));
    const audit = await prisma.runAsPlatform((tx) => tx.auditLog.findFirst({ where: { action: 'PAYMENT_SETTLE_NOW', restaurantId }, orderBy: { createdAt: 'desc' } }));
    expect((audit!.details as { settlementId?: string }).settlementId).toBe('555');
  });

  it('Settle now surfaces a Cashfree refusal and is blocked for a restaurant with no Cashfree vendor', async () => {
    const url = `/api/v1/restaurants/${restaurantId}/payment-connection/settle-now`;
    gateway.settleVendorOnDemand.mockRejectedValueOnce(new (await import('@nestjs/common')).ServiceUnavailableException('balance below minimum'));
    expect((await authed('post', url, platformToken).send({ amountPaise: 500000, password: adminPassword })).status).toBe(503);

    await prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.update({ where: { restaurantId }, data: { cashfreeVendorId: null } }));
    expect((await authed('post', url, platformToken).send({ amountPaise: 500000, password: adminPassword })).status).toBe(403);
    await prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.update({ where: { restaurantId }, data: { cashfreeVendorId: 'rest_kflow_vendor' } }));
  });
});
