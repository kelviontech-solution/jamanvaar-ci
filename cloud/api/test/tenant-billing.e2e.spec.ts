import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * security-audit CRIT-02 regression: `POST /tenant/billing/invoices/:id/pay` used to be
 * callable by ANY authenticated tenant user (including STAFF), with no payment-gateway
 * proof behind it, no cap on VOID/REFUNDED invoices, and no protection for a platform-
 * suspended subscription. This suite proves the fix: OWNER-only, only ISSUED/PAST_DUE
 * invoices are payable, the amount is capped at the outstanding balance, and a
 * SUSPENDED subscription is never silently reactivated by a tenant-initiated payment.
 */
describe('Tenant billing payment authorization (CRIT-02)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminEmail = `test-tbilling-admin-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';
  let platformToken: string;
  let restaurantId: string;
  let planId: string;
  let subscriptionId: string;
  let ownerToken: string;
  let staffToken: string;
  const ownerEmail = `test-tbilling-owner-${Date.now()}@example.com`;
  const ownerPassword = 'owner-correct-horse-battery';
  const staffEmail = `test-tbilling-staff-${Date.now()}@example.com`;
  const staffPassword = 'staff-correct-horse-battery';

  const authed = (method: 'get' | 'post' | 'patch', url: string, token: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString();

  async function issueInvoice() {
    const inv = await authed('post', '/api/v1/invoices', platformToken).send({
      restaurantId,
      amount: 700000,
      dueDate: inDays(7),
      billingPeriodStart: inDays(0),
      billingPeriodEnd: inDays(30),
      subscriptionId
    });
    expect(inv.status, JSON.stringify(inv.body)).toBe(201);
    return inv.body.id as string;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const login = await platformLogin(app, adminEmail, adminPassword);
    platformToken = login.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants', platformToken).send({
      name: `TEST Tenant Billing Restaurant ${Date.now()}`,
      ownerName: 'Tenant Billing Owner',
      ownerEmail
    });
    restaurantId = restaurantRes.body.restaurant.id;
    const ownerActivationToken = restaurantRes.body.activationToken;

    await request(app.getHttpServer()).post('/api/v1/tenant-auth/set-initial-password').send({
      restaurantId,
      email: ownerEmail,
      activationToken: ownerActivationToken,
      newPassword: ownerPassword
    });
    const ownerLogin = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login').send({ restaurantId, email: ownerEmail, password: ownerPassword });
    ownerToken = ownerLogin.body.accessToken;

    const planRes = await authed('post', '/api/v1/plans', platformToken).send({
      tier: 'PRO', name: `TEST Tenant Billing Plan ${Date.now()}`, priceMonthly: 700000, maxBranches: 3, maxDevices: 20, maxUsers: 20, entitlements: { posTerminal: true }
    });
    planId = planRes.body.id;
    const subRes = await authed('post', '/api/v1/subscriptions', platformToken).send({ restaurantId, planId, status: 'ACTIVE', expiresAt: inDays(30) });
    subscriptionId = subRes.body.id;

    // A STAFF login, created by the owner — this is the lower-privilege actor CRIT-02 was about.
    const staffRes = await authed('post', '/api/v1/tenant/me/users', ownerToken).send({
      email: staffEmail, fullName: 'Test Staff', role: 'STAFF', password: staffPassword
    });
    expect(staffRes.status, JSON.stringify(staffRes.body)).toBe(201);
    const staffLogin = await request(app.getHttpServer()).post('/api/v1/tenant-auth/login').send({ restaurantId, email: staffEmail, password: staffPassword });
    staffToken = staffLogin.body.accessToken;
  });

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    if (planId) await prisma.runAsPlatform((tx) => tx.plan.deleteMany({ where: { id: planId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('a STAFF login cannot pay an invoice', async () => {
    const invoiceId = await issueInvoice();
    const res = await authed('post', `/api/v1/tenant/billing/invoices/${invoiceId}/pay`, staffToken).send({});
    expect(res.status).toBe(403);

    const invoice = await prisma.runAsPlatform((tx) => tx.invoice.findUnique({ where: { id: invoiceId } }));
    expect(invoice!.status).not.toBe('PAID');
  });

  it('the OWNER can pay an ISSUED invoice in full', async () => {
    const invoiceId = await issueInvoice();
    const res = await authed('post', `/api/v1/tenant/billing/invoices/${invoiceId}/pay`, ownerToken).send({});
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.invoice.status).toBe('PAID');
  });

  it('a VOID invoice cannot be paid', async () => {
    const invoiceId = await issueInvoice();
    const voidRes = await authed('patch', `/api/v1/invoices/${invoiceId}/status`, platformToken).send({ status: 'VOID', reason: 'test void' });
    expect(voidRes.status).toBe(200);

    const res = await authed('post', `/api/v1/tenant/billing/invoices/${invoiceId}/pay`, ownerToken).send({});
    expect(res.status).toBe(400);
  });

  it('a payment amount larger than the outstanding balance is capped, not accepted as an overpayment', async () => {
    const invoiceId = await issueInvoice();
    const invoiceBefore = await prisma.runAsPlatform((tx) => tx.invoice.findUnique({ where: { id: invoiceId } }));
    const res = await authed('post', `/api/v1/tenant/billing/invoices/${invoiceId}/pay`, ownerToken).send({ amount: 999999999 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.payment.amount).toBe(invoiceBefore!.totalAmount);
  });

  it('paying an invoice while the subscription is platform-SUSPENDED does not silently reactivate it', async () => {
    const invoiceId = await issueInvoice();
    const suspendRes = await authed('patch', `/api/v1/subscriptions/${subscriptionId}/suspend`, platformToken).send({});
    expect(suspendRes.status, JSON.stringify(suspendRes.body)).toBe(200);

    const res = await authed('post', `/api/v1/tenant/billing/invoices/${invoiceId}/pay`, ownerToken).send({});
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.invoice.status).toBe('PAID');

    const sub = await prisma.runAsPlatform((tx) => tx.subscription.findUnique({ where: { id: subscriptionId } }));
    expect(sub!.status).toBe('SUSPENDED');

    // Clean up so later tests in this file see an active subscription again.
    await authed('patch', `/api/v1/subscriptions/${subscriptionId}/reactivate`, platformToken).send({});
  });
});
