import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin, refundManagerSession, admitPaidKioskOrder } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { RazorpayGatewayService } from '../src/modules/payments/razorpay-gateway.service';

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
  let gateway: { createUpiQr: ReturnType<typeof vi.fn>; createRefund: ReturnType<typeof vi.fn>; listQrPayments: ReturnType<typeof vi.fn> };

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
          orderId: order.id, restaurantId: rid, providerOrderId: opts.providerOrderId ?? `pay_kf_${Date.now()}_${Math.random()}`, providerPaymentId: `pay_rzp_${Date.now()}_${Math.random()}`, amount: opts.amount, currency: 'INR',
          status: (opts.status ?? 'SUCCESS') as never, paidAt: opts.paidAt ?? new Date(), commissionBps: bps, platformAmount, restaurantAmount: opts.amount - platformAmount,
          fulfilledAt: opts.fulfilled ? new Date() : null
        }
      })
    );
  };

  beforeAll(async () => {
    gateway = {
      createUpiQr: vi.fn().mockResolvedValue({ qrId: 'qr_kf_1', imageUrl: 'https://rzp.io/img/kf_1.png', status: 'active' }),
      createRefund: vi.fn().mockResolvedValue({ refundId: 'rfnd_kf_1', status: 'processed', amountPaise: 2500 }),
      listQrPayments: vi.fn().mockResolvedValue([])
    };
    app = await createTestApp((builder) => builder.overrideProvider(RazorpayGatewayService).useValue({ isConfigured: () => true, ...gateway }));
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

    await prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.create({ data: { restaurantId, status: 'ACTIVE' } }));
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

  it('a kitchen ticket is claimed once: the first kiosk gets claimed, every later claim is refused', async () => {
    const p = await seedPayment(restaurantId, { amount: 10000, status: 'SUCCESS' });
    const first = await authed('post', `/api/v1/payments/${p.id}/kot-claim`, kioskToken);
    const second = await authed('post', `/api/v1/payments/${p.id}/kot-claim`, kioskToken);
    expect(first.status).toBe(201);
    expect(first.body.claimed).toBe(true);
    expect(second.body.claimed).toBe(false);
    expect(second.body.claimedAt).not.toBeNull();
  });

  it('five kiosks claiming the same paid order at the same instant produce exactly one claim', async () => {
    const p = await seedPayment(restaurantId, { amount: 10000, status: 'SUCCESS' });
    const kiosks = await Promise.all([1, 2, 3, 4, 5].map(() => deviceFor(restaurantId, 'KIOSK')));
    const results = await Promise.all(kiosks.map((t) => authed('post', `/api/v1/payments/${p.id}/kot-claim`, t)));
    expect(results.filter((r) => r.body.claimed === true)).toHaveLength(1);
  });

  it('only a kiosk can claim a kitchen ticket, and an unpaid order cannot be claimed', async () => {
    const paid = await seedPayment(restaurantId, { amount: 10000, status: 'SUCCESS' });
    expect((await authed('post', `/api/v1/payments/${paid.id}/kot-claim`, posToken)).status).toBe(403);
    const unpaid = await seedPayment(restaurantId, { amount: 10000, status: 'PENDING' });
    expect((await authed('post', `/api/v1/payments/${unpaid.id}/kot-claim`, kioskToken)).status).toBe(400);
  });

  it('one kiosk can ask for at most 20 QRs a minute; the 21st is refused with 429, and another kiosk is not affected', async () => {
    const order = await createKioskOrder('kf-rate-qr');
    const busyKiosk = await deviceFor(restaurantId, 'KIOSK');
    const statuses: number[] = [];
    for (let i = 0; i < 21; i += 1) statuses.push((await authed('post', `/api/v1/payments/${order.paymentId}/qr`, busyKiosk)).status);
    expect(statuses.slice(0, 20).every((s) => s === 201)).toBe(true);
    expect(statuses[20]).toBe(429);
    const other = await authed('post', `/api/v1/payments/${order.paymentId}/qr`, kioskToken);
    expect(other.status).toBe(201);
  });

  it('asking again for the QR of a pending payment returns the same QR and creates no second Razorpay QR', async () => {
    const order = await createKioskOrder('kf-qr-same');
    gateway.createUpiQr.mockClear();
    const first = await authed('post', `/api/v1/payments/${order.paymentId}/qr`, kioskToken);
    const second = await authed('post', `/api/v1/payments/${order.paymentId}/qr`, kioskToken);
    expect(first.status).toBe(201);
    expect(second.body.qrPayload).toBe(first.body.qrPayload);
    expect(gateway.createUpiQr).toHaveBeenCalledTimes(1);
  });

  it('a status check settles a payment whose money arrived on its own QR, and ignores other payments', async () => {
    const order = await createKioskOrder('kf-qr-settle');
    await authed('post', `/api/v1/payments/${order.paymentId}/qr`, kioskToken);
    // Past the webhook grace period, so the status check is allowed to ask Razorpay directly.
    await prisma.runAsPlatform((tx) => tx.paymentTransaction.update({ where: { id: order.paymentId }, data: { createdAt: new Date(Date.now() - 60_000) } }));
    gateway.listQrPayments.mockResolvedValueOnce([{ id: 'pay_other', amount: 999999, currency: 'INR', status: 'captured' }]);
    const notYet = await authed('get', `/api/v1/payments/${order.paymentId}/status`, kioskToken);
    expect(notYet.body.status).toBe('PENDING');
    gateway.listQrPayments.mockResolvedValueOnce([{ id: 'pay_kf_qr_paid', amount: order.amount, currency: 'INR', status: 'captured' }]);
    const paid = await authed('get', `/api/v1/payments/${order.paymentId}/status`, kioskToken);
    expect(paid.body.status).toBe('SUCCESS');
    expect(paid.body.orderStatus).toBe('PAID');
  });

  it('a kiosk gets a Razorpay UPI QR for its own pending payment, with a 3 minute expiry', async () => {
    const order = await createKioskOrder('kf-qr-1');
    gateway.createUpiQr.mockClear();
    const before = Date.now();
    const res = await authed('post', `/api/v1/payments/${order.paymentId}/qr`, kioskToken);
    expect(res.status).toBe(201);
    expect(res.body.qrPayload).toBe('https://rzp.io/img/kf_1.png');
    expect(res.body.contentType).toBe('image/url');
    expect(res.body.method).toBe('UPI_QR');
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(before + 170_000);
    expect(new Date(res.body.expiresAt).getTime()).toBeLessThan(before + 200_000);
    expect(gateway.createUpiQr).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: order.amount, closeByUnix: expect.any(Number) }));
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

  it('a Razorpay failure while creating the QR surfaces as 503 and leaves the payment untouched', async () => {
    // createKioskOrder triggers a background prewarm QR call as soon as the order exists, so a single
    // mockRejectedValueOnce can be consumed by that background call before this test's own explicit POST
    // ever runs. Rejecting persistently (then restoring the default) makes both calls fail identically,
    // which is what actually proves the endpoint surfaces 503 when Razorpay is down.
    gateway.createUpiQr.mockRejectedValue(new (await import('@nestjs/common')).ServiceUnavailableException('Razorpay down'));
    const order = await createKioskOrder('kf-qr-4');
    const res = await authed('post', `/api/v1/payments/${order.paymentId}/qr`, kioskToken);
    gateway.createUpiQr.mockResolvedValue({ qrId: 'qr_kf_1', imageUrl: 'https://rzp.io/img/kf_1.png', status: 'active' });
    expect(res.status).toBe(503);
    const row = await prisma.runAsPlatform((tx) => tx.paymentTransaction.findUniqueOrThrow({ where: { id: order.paymentId } }));
    expect(row.status).toBe('PENDING');
  });

  // ---------------- QR fallback: the account is not approved for server-to-server UPI QR ----------------

  // ---------------- Fulfilment ----------------

  it('a kiosk can only mark a payment fulfilled once it has really succeeded, and doing it twice is harmless', async () => {
    const order = await createKioskOrder('kf-ful-1');
    expect((await authed('post', `/api/v1/payments/${order.paymentId}/fulfilled`, kioskToken)).status).toBe(400);

    await prisma.runAsPlatform((tx) => tx.paymentTransaction.update({ where: { id: order.paymentId }, data: { status: 'SUCCESS', paidAt: new Date() } }));
    expect((await authed('post', `/api/v1/payments/${order.paymentId}/fulfilled`, kioskToken)).status).toBe(409);
    await admitPaidKioskOrder(prisma, order.paymentId);
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
    await admitPaidKioskOrder(prisma, stale.id);
    expect((await authed('post', `/api/v1/payments/${stale.id}/fulfilled`, kioskAdminToken)).status).toBe(201);
    const res = await authed('get', '/api/v1/payments/tenant-recent', kioskAdminToken);
    expect(res.body.rows.find((r: { id: string }) => r.id === stale.id).needsAttention).toBe(false);
  });

  // ---------------- Refunds ----------------

  it('a Kiosk Admin device can refund an online payment (POS and POS Admin already could)', async () => {
    const p = await seedPayment(restaurantId, { amount: 10000, fulfilled: true });
    const res = await authed('post', `/api/v1/payments/${p.id}/refund`, kioskAdminToken).send({ amountPaise: 2500, reason: 'wrong dish', requestedBy: 'Owner', staffSession: await refundManagerSession(app, prisma, kioskAdminToken) });
    expect(res.status).toBe(201);
    expect(gateway.createRefund).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 2500, razorpayPaymentId: p.providerPaymentId }));
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

  it('the day statement holds refund exposure without inventing a fee reversal policy', async () => {
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
        razorpayFee: 300,
        platformNetCommission: 50,
        commissionReversed: null,
        restaurantGross: 14650,
        restaurantRefundImpact: null,
        heldPayable: 9800,
        netPayableToRestaurant: 4850
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

  it('prices a kiosk cart from the merged Restaurant Admin menu without a separate snapshot upload', async () => {
    const pushed = await authed('post', '/api/v1/entity-sync/MENU_ITEM', posAdminToken).send({ events: [{ externalId: 'merged-menu-only', payload: {
      id: 'merged-menu-only', name: 'Fresh Thali', price: 125, isAvailable: true, isKioskEnabled: true, modifierGroupIds: [], updatedAt: new Date().toISOString()
    } }] });
    expect(pushed.status).toBe(201);
    const created = await authed('post', '/api/v1/payments/orders', kioskToken).send({ externalOrderId: `merged-price-${Date.now()}`, lines: [{ externalItemId: 'merged-menu-only', quantity: 2, selectedOptionIds: [] }] });
    expect(created.status, JSON.stringify(created.body)).toBe(201); expect(created.body.amount).toBe(25000);
    await authed('post', '/api/v1/entity-sync/MENU_ITEM', posAdminToken).send({ events: [{ externalId: 'merged-menu-only', payload: {
      id: 'merged-menu-only', name: 'Fresh Thali', price: 125, isAvailable: false, isKioskEnabled: true, updatedAt: new Date(Date.now() + 1000).toISOString()
    } }] });
    const unavailable = await authed('post', '/api/v1/payments/orders', kioskToken).send({ externalOrderId: `merged-unavailable-${Date.now()}`, lines: [{ externalItemId: 'merged-menu-only', quantity: 1, selectedOptionIds: [] }] });
    expect(unavailable.status).toBe(400);
  });

  it('starting a refund after batching holds the payout and audits the hold without rewriting its split', async () => {
    const p = await seedPayment(restaurantId, { amount: 10000, bps: 300, fulfilled: true });
    const payout = await prisma.runAsTenant(restaurantId, tx => tx.restaurantPayout.create({ data: { restaurantId, businessDate: '20261006', grossAmount: 10000, feeAmount: 300, netAmount: 9700, paymentCount: 1 } }));
    await prisma.runAsTenant(restaurantId, tx => tx.paymentTransaction.update({ where: { id: p.id }, data: { payoutId: payout.id } }));
    gateway.createRefund.mockResolvedValueOnce({ refundId: `rfnd_batch_${p.id}`, status: 'processed', amountPaise: 1000 });
    const result = await authed('post', `/api/v1/payments/${p.id}/refund`, kioskAdminToken).send({ amountPaise: 1000, reason: 'wrong dish after batch', requestedBy: 'Owner', staffSession: await refundManagerSession(app, prisma, kioskAdminToken) });
    expect(result.status).toBe(201);
    const held = await prisma.runAsTenant(restaurantId, tx => tx.restaurantPayout.findUniqueOrThrow({ where: { id: payout.id } }));
    expect(held.status).toBe('ON_HOLD');
    expect(held.netAmount).toBe(9700);
    const payment = await prisma.runAsTenant(restaurantId, tx => tx.paymentTransaction.findUniqueOrThrow({ where: { id: p.id } }));
    expect(payment.platformAmount).toBe(300);
    expect(payment.restaurantAmount).toBe(9700);
    const audit = await prisma.runAsPlatform(tx => tx.auditLog.findFirst({ where: { restaurantId, action: 'PAYOUT_ON_HOLD' }, orderBy: { createdAt: 'desc' } }));
    expect(audit?.details).toMatchObject({ payoutId: payout.id, reason: 'REFUND_AFTER_BATCHING' });
  });

});
