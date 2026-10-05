import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

const APPS = ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN'];

/**
 * The temporary manual payout path (Razorpay Route pending — see RestaurantPayoutsService's own doc comment):
 * restaurant approval is no longer blocked, collections accumulate with their existing server-computed
 * commission split, the EOD batch claims them into one payout per restaurant per day, and only a Super Admin
 * with a UTR can mark one paid.
 */
describe('Manual restaurant payouts (Route pending)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `test-payouts-admin-${stamp}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let planId: string;
  const ids: string[] = [];

  const authed = (method: 'get' | 'post' | 'patch', url: string, token?: string) => {
    const req = request(app.getHttpServer())[method](url);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  const deviceFor = async (rid: string, type: string) => {
    const keyRes = await authed('post', '/api/v1/activation-keys', platformToken).send({ restaurantId: rid, allowedDeviceType: type, expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const redeem = await request(app.getHttpServer()).post('/api/v1/activation/redeem').send({ code: keyRes.body.code, deviceType: type });
    return redeem.body.deviceToken as string;
  };

  const makeRestaurant = async (label: string) => {
    const res = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Payout ${label} ${stamp}`,
      ownerName: 'Payout Owner',
      ownerEmail: `payout-${label}-${stamp}@test.example.com`
    });
    const rid = res.body.restaurant.id as string;
    ids.push(rid);
    await authed('post', '/api/v1/subscriptions', platformToken).send({
      restaurantId: rid,
      planId,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      applications: APPS
    });
    await prisma.runAsTenant(rid, (tx) => tx.restaurantPaymentConnection.create({ data: { restaurantId: rid, status: 'ACTIVE' } }));
    return { rid, kioskAdmin: await deviceFor(rid, 'KIOSK_ADMIN') };
  };

  const seedPayment = async (rid: string, opts: { amount: number; bps?: number; refunded?: boolean }) => {
    const bps = opts.bps ?? 300;
    const platformAmount = Math.round((opts.amount * bps) / 10000);
    const restaurantAmount = opts.amount - platformAmount;
    const order = await prisma.runAsTenant(rid, (tx) =>
      tx.order.create({ data: { restaurantId: rid, externalOrderId: `payout-${stamp}-${Math.random()}`, items: [], subtotal: opts.amount, taxAmount: 0, totalAmount: opts.amount, status: 'PAID' } })
    );
    const payment = await prisma.runAsTenant(rid, (tx) =>
      tx.paymentTransaction.create({
        data: {
          orderId: order.id,
          restaurantId: rid,
          providerOrderId: `pay_payout_${stamp}_${Math.random()}`,
          providerPaymentId: `pay_rzp_payout_${stamp}_${Math.random()}`,
          amount: opts.amount,
          status: 'SUCCESS',
          paidAt: new Date(),
          commissionBps: bps,
          platformAmount,
          restaurantAmount
        }
      })
    );
    if (opts.refunded) {
      await prisma.runAsTenant(rid, (tx) => tx.refund.create({ data: { paymentId: payment.id, restaurantId: rid, amount: opts.amount, status: 'SUCCESS' } }));
    }
    return payment;
  };

  const verifyBank = async (rid: string) => {
    await prisma.runAsPlatform((tx) =>
      tx.restaurantPaymentConnection.update({ where: { restaurantId: rid }, data: { settlementAccountNumberEncrypted: null, settlementUpiVpa: 'owner@upi' } })
    );
    const res = await authed('patch', `/api/v1/payments/payouts/bank-verification/${rid}`, platformToken).send({ status: 'VERIFIED', password: adminPassword });
    expect(res.status).toBe(200);
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    platformToken = (await platformLogin(app, adminEmail, adminPassword)).body.accessToken;
    const plan = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO',
      name: `TEST Payout Plan ${stamp}`,
      priceMonthly: 700000,
      maxBranches: 3,
      maxDevices: 20,
      maxUsers: 20,
      entitlements: { selfOrderKiosk: true }
    });
    planId = plan.body.id;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: ids } } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  // ---------- Restaurant approval is not blocked by Route ----------

  it('restaurant approval activates online payments even though Route is still pending', async () => {
    const res = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Payout Approve ${stamp}`,
      ownerName: 'Owner',
      ownerEmail: `payout-approve-${stamp}@test.example.com`
    });
    const rid = res.body.restaurant.id as string;
    ids.push(rid);
    await prisma.runAsTenant(rid, (tx) => tx.restaurantPaymentConnection.create({ data: { restaurantId: rid, status: 'PENDING_VERIFICATION' } }));
    const approveRes = await authed('patch', `/api/v1/restaurants/${rid}/payment-connection/approve`, platformToken).send({ password: adminPassword });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe('ACTIVE');
  });

  // ---------- EOD batch ----------

  it('EOD claims unpaid collections for a bank-verified restaurant into one payout, and ignores an unverified one', async () => {
    const a = await makeRestaurant('a');
    const b = await makeRestaurant('b');
    await verifyBank(a.rid);
    // b's bank is deliberately left NOT_ADDED.

    await seedPayment(a.rid, { amount: 100000 }); // ₹1,000 -> 3% fee 30000? no: 100000*300/10000=3000
    await seedPayment(a.rid, { amount: 50000 });
    await seedPayment(b.rid, { amount: 20000 });

    const eod = await authed('post', '/api/v1/payments/payouts/run-eod', platformToken).send({});
    expect(eod.status).toBe(201);
    expect(eod.body.restaurantsConsidered).toBe(1); // only a: ACTIVE + VERIFIED
    expect(eod.body.payoutsCreated).toBe(1);

    const list = await authed('get', `/api/v1/payments/payouts?restaurantId=${a.rid}`, platformToken);
    expect(list.body.rows).toHaveLength(1);
    const payout = list.body.rows[0];
    expect(payout.grossAmount).toBe(150000);
    expect(payout.feeAmount).toBe(4500); // 3000 + 1500
    expect(payout.netAmount).toBe(145500);
    expect(payout.paymentCount).toBe(2);
    expect(payout.status).toBe('PENDING');

    // b was never considered: no payout row for it at all.
    const listB = await authed('get', `/api/v1/payments/payouts?restaurantId=${b.rid}`, platformToken);
    expect(listB.body.rows).toHaveLength(0);
  });

  it('running EOD twice the same day creates exactly one payout, not two', async () => {
    const a = await makeRestaurant('dup');
    await verifyBank(a.rid);
    await seedPayment(a.rid, { amount: 10000 });

    const first = await authed('post', '/api/v1/payments/payouts/run-eod', platformToken).send({});
    expect(first.body.payoutsCreated).toBeGreaterThanOrEqual(1);
    const second = await authed('post', '/api/v1/payments/payouts/run-eod', platformToken).send({});
    // Nothing left unclaimed for this restaurant on the second run — no new payout, even though other restaurants' fixtures may still create their own.
    const list = await authed('get', `/api/v1/payments/payouts?restaurantId=${a.rid}`, platformToken);
    expect(list.body.rows).toHaveLength(1);
    expect(second.status).toBe(201);
  });

  it('a refunded payment is excluded from the batch entirely', async () => {
    const a = await makeRestaurant('refund');
    await verifyBank(a.rid);
    await seedPayment(a.rid, { amount: 10000, refunded: true });
    await seedPayment(a.rid, { amount: 5000 });

    await authed('post', '/api/v1/payments/payouts/run-eod', platformToken).send({});
    const list = await authed('get', `/api/v1/payments/payouts?restaurantId=${a.rid}`, platformToken);
    expect(list.body.rows).toHaveLength(1);
    expect(list.body.rows[0].grossAmount).toBe(5000); // only the unrefunded payment
    expect(list.body.rows[0].paymentCount).toBe(1);
  });

  it('a payout with no eligible payments (all refunded) is never created', async () => {
    const a = await makeRestaurant('allrefunded');
    await verifyBank(a.rid);
    await seedPayment(a.rid, { amount: 10000, refunded: true });

    await authed('post', '/api/v1/payments/payouts/run-eod', platformToken).send({});
    const list = await authed('get', `/api/v1/payments/payouts?restaurantId=${a.rid}`, platformToken);
    expect(list.body.rows).toHaveLength(0);
  });

  // ---------- Mark paid ----------

  it('mark-paid requires a UTR and the step-up password, and cannot be repeated', async () => {
    const a = await makeRestaurant('markpaid');
    await verifyBank(a.rid);
    await seedPayment(a.rid, { amount: 10000 });
    await authed('post', '/api/v1/payments/payouts/run-eod', platformToken).send({});
    const list = await authed('get', `/api/v1/payments/payouts?restaurantId=${a.rid}`, platformToken);
    const payoutId = list.body.rows[0].id;

    const noUtr = await authed('patch', `/api/v1/payments/payouts/${payoutId}/mark-paid`, platformToken).send({ utr: '', password: adminPassword });
    expect(noUtr.status).toBe(400);

    const wrongPassword = await authed('patch', `/api/v1/payments/payouts/${payoutId}/mark-paid`, platformToken).send({ utr: 'UTR12345', password: 'wrong' });
    expect(wrongPassword.status).toBe(403);

    const ok = await authed('patch', `/api/v1/payments/payouts/${payoutId}/mark-paid`, platformToken).send({ utr: 'UTR12345', password: adminPassword });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('PAID');
    expect(ok.body.utr).toBe('UTR12345');
    expect(ok.body.paidAt).not.toBeNull();

    const again = await authed('patch', `/api/v1/payments/payouts/${payoutId}/mark-paid`, platformToken).send({ utr: 'UTR99999', password: adminPassword });
    expect(again.status).toBe(409);
  });

  it('hold then release returns a payout to PENDING, and a paid payout cannot be held', async () => {
    const a = await makeRestaurant('hold');
    await verifyBank(a.rid);
    await seedPayment(a.rid, { amount: 10000 });
    await authed('post', '/api/v1/payments/payouts/run-eod', platformToken).send({});
    const list = await authed('get', `/api/v1/payments/payouts?restaurantId=${a.rid}`, platformToken);
    const payoutId = list.body.rows[0].id;

    const held = await authed('patch', `/api/v1/payments/payouts/${payoutId}/hold`, platformToken).send({ reason: 'bank details under review', password: adminPassword });
    expect(held.status).toBe(200);
    expect(held.body.status).toBe('ON_HOLD');

    const released = await authed('patch', `/api/v1/payments/payouts/${payoutId}/release`, platformToken).send({ password: adminPassword });
    expect(released.status).toBe(200);
    expect(released.body.status).toBe('PENDING');

    await authed('patch', `/api/v1/payments/payouts/${payoutId}/mark-paid`, platformToken).send({ utr: 'UTR1', password: adminPassword });
    const holdAfterPaid = await authed('patch', `/api/v1/payments/payouts/${payoutId}/hold`, platformToken).send({ reason: 'x', password: adminPassword });
    expect(holdAfterPaid.status).toBe(409);
  });

  // ---------- Restaurant-facing summary, scoped to its own data ----------

  it('a restaurant sees only its own payout summary and history, never another restaurant\'s', async () => {
    const a = await makeRestaurant('viewa');
    const b = await makeRestaurant('viewb');
    await verifyBank(a.rid);
    await verifyBank(b.rid);
    await seedPayment(a.rid, { amount: 100000 });
    await seedPayment(b.rid, { amount: 500000 });
    await authed('post', '/api/v1/payments/payouts/run-eod', platformToken).send({});

    const summaryA = await authed('get', '/api/v1/payments/payout-summary', a.kioskAdmin);
    expect(summaryA.status).toBe(200);
    expect(summaryA.body.grossCollection).toBe(100000);
    expect(summaryA.body.pendingPayout).toBe(97000);

    const historyA = await authed('get', '/api/v1/payments/payout-history', a.kioskAdmin);
    expect(historyA.body.rows).toHaveLength(1);
    expect(historyA.body.rows[0].netAmount).toBe(97000);
    // Never restaurant b's much larger numbers.
    expect(historyA.body.rows[0].netAmount).not.toBe(485000);
  });

  it('bank verification requires the step-up password and cannot be set without bank details on file', async () => {
    const a = await makeRestaurant('nobank');
    const noPassword = await authed('patch', `/api/v1/payments/payouts/bank-verification/${a.rid}`, platformToken).send({ status: 'VERIFIED' });
    expect(noPassword.status).toBe(403);

    const noBankDetails = await authed('patch', `/api/v1/payments/payouts/bank-verification/${a.rid}`, platformToken).send({ status: 'VERIFIED', password: adminPassword });
    expect(noBankDetails.status).toBe(400);
  });
});
