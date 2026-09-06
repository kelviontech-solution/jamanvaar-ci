import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
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

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/platform-auth/login')
      .send({ email: adminEmail, password: adminPassword });
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
      expect(res.body.invoiceNumber).toMatch(/^INV-\d{4}-\d{4}$/);
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
      const newVersion = `2.5.${Date.now() % 1000}`;
      const res = await authed('post', '/api/v1/applications/releases').send({
        appCode: 'POS',
        version: newVersion,
        channel: 'STABLE',
        supportedPlatforms: ['windows', 'electron'],
        releaseNotes: 'Performance improvements and new bill printer driver'
      });

      expect(res.status).toBe(201);
      expect(res.body.version).toBe(newVersion);
    });
  });

  describe('Support & Diagnostics', () => {
    it('performs global search across restaurants and owners', async () => {
      const res = await authed('get', '/api/v1/support/search?q=Enterprise');
      expect(res.status).toBe(200);
      expect(res.body.restaurants.length).toBeGreaterThanOrEqual(1);
      expect(res.body.restaurants[0].name).toContain('TEST Enterprise Dining');
    });

    it('retrieves diagnostic health snapshot for a restaurant', async () => {
      const res = await authed('get', `/api/v1/support/diagnostics/${restaurantId}`);
      expect(res.status).toBe(200);
      expect(res.body.restaurant.id).toBe(restaurantId);
      expect(res.body.activeSubscription).toBeDefined();
      expect(res.body.entitlements).toBeDefined();
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
