import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('New SaaS Modules: Invoices, Applications, Support, and Platform Settings', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  const adminEmail = `test-new-saas-${Date.now()}@example.com`;
  const adminPassword = 'correct-horse-battery-staple';

  let restaurantId: string;
  let planId: string;
  let subscriptionId: string;
  let createdInvoiceId: string;

  const authed = (method: 'get' | 'post' | 'patch' | 'delete', url: string) =>
    request(app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${accessToken}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password: adminPassword });

    const loginRes = await platformLogin(app, adminEmail, adminPassword);
    accessToken = loginRes.body.accessToken;

    const restaurantRes = await authed('post', '/api/v1/restaurants').send({
      name: `TEST Enterprise Dining ${Date.now()}`,
      legalName: 'TEST Enterprise Dining Pvt Ltd',
      gstin: '24ABCDE1234F1Z5',
      city: 'Ahmedabad',
      ownerName: 'Harshil Mehta',
      ownerEmail: `enterprise-owner-${Date.now()}@test.example.com`
    });
    restaurantId = restaurantRes.body.restaurant.id;

    // Fetch seed core plan
    const plansRes = await authed('get', '/api/v1/plans');
    planId = plansRes.body[0].id;

    const subRes = await authed('post', '/api/v1/subscriptions').send({
      restaurantId,
      planId,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
    subscriptionId = subRes.body.id;
  });

  afterAll(async () => {
    await prisma.runAsPlatform(async (tx) => {
      await tx.restaurant.deleteMany({ where: { id: restaurantId } });
    });
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  describe('Billing & Invoices', () => {
    it('creates an invoice for a restaurant subscription', async () => {
      const now = new Date();
      const res = await authed('post', '/api/v1/invoices').send({
        restaurantId,
        subscriptionId,
        planId,
        amount: 500000,
        taxAmount: 90000,
        dueDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        billingPeriodStart: now.toISOString(),
        billingPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        notes: 'Monthly billing cycle'
      });

      expect(res.status).toBe(201);
      expect(res.body.invoiceNumber).toMatch(/^INV-\d{4}-\d{2}-\d{4,}$/);
      expect(res.body.totalAmount).toBe(590000);
      expect(res.body.status).toBe('ISSUED');
      createdInvoiceId = res.body.id;
    });

    it('lists invoices and finds the newly created invoice', async () => {
      const res = await authed('get', '/api/v1/invoices');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const found = res.body.find((i: any) => i.id === createdInvoiceId);
      expect(found).toBeDefined();
      expect(found.restaurant.name).toContain('TEST Enterprise Dining');
    });

    it('records a payment and transitions status to PAID when fully settled', async () => {
      const res = await authed('post', `/api/v1/invoices/${createdInvoiceId}/payments`).send({
        amount: 590000,
        method: 'UPI',
        referenceNumber: 'TEST-UPI-REF-001',
        notes: 'Full payment via UPI BharatQR'
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PAID');
      expect(res.body.paidAt).not.toBeNull();
      expect(res.body.payments.length).toBe(1);
    });

    it('returns billing summary with recognized totals', async () => {
      const res = await authed('get', '/api/v1/invoices/summary');
      expect(res.status).toBe(200);
      expect(res.body.totalInvoices).toBeGreaterThanOrEqual(1);
      expect(res.body.paidInvoices).toBeGreaterThanOrEqual(1);
      expect(res.body.totalCollected).toBeGreaterThanOrEqual(5900);
    });
  });

  describe('Applications & Releases', () => {
    it('lists all 6 client applications with metadata and active device counts', async () => {
      const res = await authed('get', '/api/v1/applications');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(6);

      const codes = res.body.map((a: any) => a.code);
      expect(codes).toContain('POS');
      expect(codes).toContain('RESTAURANT_ADMIN');
      expect(codes).toContain('CAPTAIN');
      expect(codes).toContain('KDS');
      expect(codes).toContain('KIOSK');
      expect(codes).toContain('KIOSK_ADMIN');
    });

    it('publishes a new application release', async () => {
      // AppRelease uniqueness is on (appCode, version) — `% 1000` throws
      // away almost all of Date.now()'s entropy, so two runs of this suite
      // within the same second (e.g. re-running the file, or CI retrying)
      // could collide on an already-published version and get a 409 for a
      // reason that has nothing to do with the behavior under test. The
      // full timestamp is unique enough, and this row is cleaned up below
      // so it never lingers as visible junk in the real Applications &
      // Releases list either way.
      const newVersion = `2.5.${Date.now()}`;
      const res = await authed('post', '/api/v1/applications/releases').send({
        appCode: 'POS',
        version: newVersion,
        channel: 'STABLE',
        supportedPlatforms: ['windows', 'electron'],
        releaseNotes: 'Performance improvements and new bill printer driver'
      });

      expect(res.status).toBe(201);
      expect(res.body.version).toBe(newVersion);

      await prisma.runAsPlatform((tx) =>
        tx.appRelease.deleteMany({ where: { appCode: 'POS', version: newVersion } })
      );
    });
  });

  describe('Support & Diagnostics', () => {
    it('performs global search across restaurants and owners', async () => {
      const res = await authed('get', '/api/v1/support/search?q=Enterprise');
      expect(res.status).toBe(200);
      expect(res.body.restaurants.length).toBeGreaterThanOrEqual(1);
      // Assert this test's own restaurant is somewhere in the results,
      // not that it's specifically first — the shared dev database can
      // (and, as real onboarding gets used, increasingly will) contain
      // other restaurants whose name/legal name also matches "Enterprise",
      // which made this assertion fail on result ordering alone even
      // though the search itself was correct.
      expect(res.body.restaurants.some((r: { name: string }) => r.name.includes('TEST Enterprise Dining'))).toBe(true);
    });

    it('retrieves diagnostic health snapshot for a restaurant', async () => {
      const res = await authed('get', `/api/v1/support/diagnostics/${restaurantId}`);
      expect(res.status).toBe(200);
      expect(res.body.restaurant.id).toBe(restaurantId);
      expect(res.body.activeSubscription).toBeDefined();
      expect(res.body.entitlements).toBeDefined();
    });

    describe('Resend invite', () => {
      let pendingOwnerId: string;
      let pendingOwnerEmail: string;
      let firstToken: string;
      let resendTestRestaurantId: string;

      beforeAll(async () => {
        pendingOwnerEmail = `resend-invite-owner-${Date.now()}@test.example.com`;
        const res = await authed('post', '/api/v1/restaurants').send({
          name: `TEST Resend Invite Restaurant ${Date.now()}`,
          ownerName: 'Resend Test Owner',
          ownerEmail: pendingOwnerEmail
        });
        resendTestRestaurantId = res.body.restaurant.id;
        pendingOwnerId = res.body.owner.id;
        firstToken = res.body.activationToken;
        // createTestApp() centrally mocks EmailService.send to swallow the send and report success
        // (so tests never hit real SMTP), so this now reports true rather than the old "no SMTP
        // configured" false.
        expect(res.body.emailSent).toBe(true);
      });

      afterAll(async () => {
        await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: resendTestRestaurantId } }));
      });

      it('rejects with no reason', async () => {
        const res = await authed('post', '/api/v1/support/resend-invite').send({ userId: pendingOwnerId });
        expect(res.status).toBe(400);
      });

      it('regenerates the activation token, reports emailSent: true (mocked, not really sent), and invalidates the old token', async () => {
        const res = await authed('post', '/api/v1/support/resend-invite').send({
          userId: pendingOwnerId,
          reason: 'test: verifying resend-invite regenerates the token'
        });
        expect(res.status).toBe(201);
        expect(res.body.emailSent).toBe(true);
        expect(res.body.activationToken).toBeTypeOf('string');
        expect(res.body.activationToken).not.toBe(firstToken);

        // The old token must no longer work.
        const oldTokenAttempt = await request(app.getHttpServer())
          .post('/api/v1/tenant-auth/set-initial-password')
          .send({
            restaurantId: resendTestRestaurantId,
            email: pendingOwnerEmail,
            activationToken: firstToken,
            newPassword: 'irrelevant-password-1'
          });
        expect(oldTokenAttempt.status).toBe(401);

        // The new token does.
        const newTokenAttempt = await request(app.getHttpServer())
          .post('/api/v1/tenant-auth/set-initial-password')
          .send({
            restaurantId: resendTestRestaurantId,
            email: pendingOwnerEmail,
            activationToken: res.body.activationToken,
            newPassword: 'irrelevant-password-1'
          });
        expect(newTokenAttempt.status).toBe(200);
      });

      it('rejects resending an invite for an already-active account', async () => {
        const res = await authed('post', '/api/v1/support/resend-invite').send({
          userId: pendingOwnerId,
          reason: 'test: should be rejected, account is already active'
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/already been activated/i);
      });
    });
  });

  describe('Platform Settings', () => {
    it('retrieves all platform settings', async () => {
      const res = await authed('get', '/api/v1/platform/settings');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('updates platform branding setting', async () => {
      const res = await authed('patch', '/api/v1/platform/settings/platform.branding').send({
        value: {
          platformName: 'JAMANVAAR SaaS Ultimate',
          companyName: 'Kelviontech Group'
        }
      });

      expect(res.status).toBe(200);
      expect(res.body.value.platformName).toBe('JAMANVAAR SaaS Ultimate');
    });
  });
});
