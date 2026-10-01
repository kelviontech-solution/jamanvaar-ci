import { INestApplication } from '@nestjs/common';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { CashfreeGatewayService } from '../src/modules/payments/cashfree-gateway.service';
import { PaymentReconciliationService } from '../src/modules/payments/payment-reconciliation.service';
import request from 'supertest';

describe('Payment reconciliation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let restaurantId: string;
  const adminEmail = `test-reconcile-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let getOrderSplitDetailsMock: ReturnType<typeof vi.fn>;
  let getPaymentLinkDetailsMock: ReturnType<typeof vi.fn>;

  const authed = (method: 'get' | 'post' | 'patch', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    getOrderSplitDetailsMock = vi.fn();
    getPaymentLinkDetailsMock = vi.fn();
    app = await createTestApp((builder) =>
      builder.overrideProvider(CashfreeGatewayService).useValue({
        isConfigured: () => true,
        getOrderSplitDetails: getOrderSplitDetailsMock,
        getPaymentLinkDetails: getPaymentLinkDetailsMock
      })
    );
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });
    const loginRes = await platformLogin(app, adminEmail, adminPassword);
    const platformToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Reconciliation Restaurant ${Date.now()}`, ownerName: 'Reconcile Owner', ownerEmail: `reconcile-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  const seedPayment = async (opts: { providerOrderId: string; amount: number; commissionBps: number; platformAmount: number; restaurantAmount: number }) => {
    const order = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({ data: { restaurantId, externalOrderId: `reconcile-${Date.now()}-${Math.random()}`, items: [], subtotal: opts.amount, taxAmount: 0, totalAmount: opts.amount, status: 'PAID' } })
    );
    return prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({
        data: {
          orderId: order.id, restaurantId, providerOrderId: opts.providerOrderId, amount: opts.amount, currency: 'INR', status: 'SUCCESS',
          commissionBps: opts.commissionBps, platformAmount: opts.platformAmount, restaurantAmount: opts.restaurantAmount
        }
      })
    );
  };

  /** Phase 8: a WHATSAPP-sourced order's payment, routed through reconcileLinkPayment
   *  instead of the Orders-API split check (see reconcile()'s own branch). */
  const seedWhatsAppPayment = async (opts: { providerOrderId: string; amount: number }) => {
    const order = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({ data: { restaurantId, externalOrderId: `reconcile-wa-${Date.now()}-${Math.random()}`, source: 'WHATSAPP', items: [], subtotal: opts.amount, taxAmount: 0, totalAmount: opts.amount, status: 'PAID' } })
    );
    return prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({
        data: { orderId: order.id, restaurantId, providerOrderId: opts.providerOrderId, amount: opts.amount, currency: 'INR', status: 'SUCCESS', commissionBps: 0, platformAmount: 0, restaurantAmount: opts.amount }
      })
    );
  };

  it('a WhatsApp payment is checked via getPaymentLinkDetails, not the Orders-API split lookup', async () => {
    const payment = await seedWhatsAppPayment({ providerOrderId: 'wapay_ok_1', amount: 50000 });
    getPaymentLinkDetailsMock.mockImplementation(async () => ({ linkStatus: 'PAID', amountPaid: 500 })); // rupees, matches 50000 paise
    getOrderSplitDetailsMock.mockClear();

    const reconciliation = app.get(PaymentReconciliationService);
    await reconciliation.reconcile();

    expect(getPaymentLinkDetailsMock).toHaveBeenCalledWith('wapay_ok_1');
    expect(getOrderSplitDetailsMock).not.toHaveBeenCalledWith('wapay_ok_1');
    const exception = await prisma.runAsPlatform((tx) => tx.reconciliationException.findFirst({ where: { paymentId: payment.id } }));
    expect(exception).toBeNull();
  });

  it('flags a WhatsApp payment whose Cashfree link never actually reached PAID', async () => {
    const payment = await seedWhatsAppPayment({ providerOrderId: 'wapay_unpaid_1', amount: 20000 });
    getPaymentLinkDetailsMock.mockImplementation(async () => ({ linkStatus: 'EXPIRED', amountPaid: 0 }));

    const reconciliation = app.get(PaymentReconciliationService);
    await reconciliation.reconcile();

    const exception = await prisma.runAsPlatform((tx) => tx.reconciliationException.findFirst({ where: { paymentId: payment.id } }));
    expect(exception).not.toBeNull();
    expect(exception!.type).toBe('UNEXPECTED_STATUS');
    expect((exception!.details as Record<string, unknown>).cashfreeLinkStatus).toBe('EXPIRED');
  });

  it('flags a WhatsApp payment whose paid amount at Cashfree disagrees with ours', async () => {
    const payment = await seedWhatsAppPayment({ providerOrderId: 'wapay_amount_1', amount: 30000 }); // ₹300
    getPaymentLinkDetailsMock.mockImplementation(async () => ({ linkStatus: 'PAID', amountPaid: 250 })); // ₹250 -- a real mismatch, not rounding noise

    const reconciliation = app.get(PaymentReconciliationService);
    await reconciliation.reconcile();

    const exception = await prisma.runAsPlatform((tx) => tx.reconciliationException.findFirst({ where: { paymentId: payment.id } }));
    expect(exception).not.toBeNull();
    expect(exception!.type).toBe('AMOUNT_MISMATCH');
  });

  it('creates a MISSING_AT_CASHFREE exception when Cashfree has no record of the split', async () => {
    const payment = await seedPayment({ providerOrderId: 'pay_missing_1', amount: 10000, commissionBps: 200, platformAmount: 200, restaurantAmount: 9800 });
    getOrderSplitDetailsMock.mockImplementation(async () => ({ splits: [] }));

    const reconciliation = app.get(PaymentReconciliationService);
    const result = await reconciliation.reconcile();

    expect(result.exceptionsCreated).toBeGreaterThanOrEqual(1);
    const exception = await prisma.runAsPlatform((tx) => tx.reconciliationException.findFirst({ where: { paymentId: payment.id } }));
    expect(exception).not.toBeNull();
    expect(exception!.type).toBe('MISSING_AT_CASHFREE');
    expect(exception!.status).toBe('OPEN');
  });

  it('does not create a second OPEN exception for a payment that already has one of the same type', async () => {
    const payment = await seedPayment({ providerOrderId: 'pay_missing_2', amount: 5000, commissionBps: 0, platformAmount: 0, restaurantAmount: 5000 });
    getOrderSplitDetailsMock.mockImplementation(async () => ({ splits: [] }));

    const reconciliation = app.get(PaymentReconciliationService);
    await reconciliation.reconcile();
    await reconciliation.reconcile();

    const exceptions = await prisma.runAsPlatform((tx) => tx.reconciliationException.findMany({ where: { paymentId: payment.id } }));
    expect(exceptions.length).toBe(1);
  });

  it('creates no exception when Cashfree confirms the expected vendor split', async () => {
    await prisma.runAsTenant(restaurantId, (tx) => tx.restaurantPaymentConnection.upsert({
      where: { restaurantId }, create: { restaurantId, status: 'ACTIVE', cashfreeVendorId: 'rest_matching_vendor' }, update: { cashfreeVendorId: 'rest_matching_vendor' }
    }));
    const payment = await seedPayment({ providerOrderId: 'pay_matching_1', amount: 8000, commissionBps: 0, platformAmount: 0, restaurantAmount: 8000 });
    getOrderSplitDetailsMock.mockImplementation(async (providerOrderId: string) =>
      providerOrderId === 'pay_matching_1' ? { splits: [{ vendorId: 'rest_matching_vendor', status: 'SETTLED' }] } : { splits: [] }
    );

    const reconciliation = app.get(PaymentReconciliationService);
    await reconciliation.reconcile();

    const exception = await prisma.runAsPlatform((tx) => tx.reconciliationException.findFirst({ where: { paymentId: payment.id } }));
    expect(exception).toBeNull();
  });

  it('a payment with no commissionBps snapshot (pre-migration row) is skipped, not flagged', async () => {
    const order = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.order.create({ data: { restaurantId, externalOrderId: `reconcile-premig-${Date.now()}`, items: [], subtotal: 3000, taxAmount: 0, totalAmount: 3000, status: 'PAID' } })
    );
    const payment = await prisma.runAsTenant(restaurantId, (tx) =>
      tx.paymentTransaction.create({ data: { orderId: order.id, restaurantId, providerOrderId: `pay_premig_${Date.now()}`, amount: 3000, currency: 'INR', status: 'SUCCESS' } })
    );

    const reconciliation = app.get(PaymentReconciliationService);
    await reconciliation.reconcile();

    const exception = await prisma.runAsPlatform((tx) => tx.reconciliationException.findFirst({ where: { paymentId: payment.id } }));
    expect(exception).toBeNull();
  });

  it('GET /api/v1/payments/reconciliation-exceptions lists exceptions filterable by restaurantId and status', async () => {
    const payment = await seedPayment({ providerOrderId: 'pay_list_1', amount: 4000, commissionBps: 0, platformAmount: 0, restaurantAmount: 4000 });
    getOrderSplitDetailsMock.mockImplementation(async () => ({ splits: [] }));
    await app.get(PaymentReconciliationService).reconcile();

    const loginRes = await platformLogin(app, adminEmail, adminPassword);
    const platformToken = loginRes.body.accessToken;
    const res = await authed('get', `/api/v1/payments/reconciliation-exceptions?restaurantId=${restaurantId}&status=OPEN`, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.rows.some((r: { paymentId: string }) => r.paymentId === payment.id)).toBe(true);
  });

  it('PATCH .../acknowledge marks an exception ACKNOWLEDGED', async () => {
    const payment = await seedPayment({ providerOrderId: 'pay_ack_1', amount: 2000, commissionBps: 0, platformAmount: 0, restaurantAmount: 2000 });
    getOrderSplitDetailsMock.mockImplementation(async () => ({ splits: [] }));
    await app.get(PaymentReconciliationService).reconcile();
    const exception = await prisma.runAsPlatform((tx) => tx.reconciliationException.findFirstOrThrow({ where: { paymentId: payment.id } }));

    const loginRes = await platformLogin(app, adminEmail, adminPassword);
    const platformToken = loginRes.body.accessToken;
    const res = await authed('patch', `/api/v1/payments/reconciliation-exceptions/${exception.id}/acknowledge`, platformToken);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACKNOWLEDGED');
  });
});
