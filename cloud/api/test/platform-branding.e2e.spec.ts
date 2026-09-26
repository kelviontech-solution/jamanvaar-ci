import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailService } from '../src/modules/notifications/email.service';

/**
 * BUG-092: the branding and contact settings were saved but nothing used them. The invoice seller
 * block (legal name, GSTIN, bank, support contact) was hard-coded, so editing Platform Settings had no
 * effect on a single invoice or email. Both now read the settings, and the seller's state decides
 * whether GST is CGST+SGST or IGST.
 */
describe('Platform branding and billing details are used (BUG-092)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const adminEmail = `brand-admin-${stamp}@example.com`;
  const password = 'correct-horse-battery-staple';
  let token: string;
  let restaurantId: string;
  let invoiceId: string;
  const saved: Record<string, unknown> = {};

  const api = (method: 'get' | 'post' | 'patch', url: string) => request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  const setting = (key: string, value: object) => api('patch', `/api/v1/platform/settings/${key}`).send({ value });
  const invoice = async () => (await api('get', `/api/v1/invoices/${invoiceId}`)).body;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email: adminEmail, password });
    token = (await platformLogin(app, adminEmail, password)).body.accessToken;

    for (const key of ['platform.branding', 'platform.billing']) {
      saved[key] = await prisma.runAsPlatform((tx) => tx.platformSetting.findUnique({ where: { key } }));
    }

    const rest = await api('post', '/api/v1/restaurants').send({ name: `TEST Brand ${stamp}`, ownerName: 'Owner', ownerEmail: `brand-${stamp}@test.example.com`, state: 'Gujarat' });
    restaurantId = rest.body.restaurant.id;
    const inv = await api('post', '/api/v1/invoices').send({
      restaurantId, amount: 1000000, dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      billingPeriodStart: new Date().toISOString(), billingPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString()
    });
    invoiceId = inv.body.id;
  }, 60_000);

  afterAll(async () => {
    await prisma.runAsPlatform(async (tx) => {
      for (const key of ['platform.branding', 'platform.billing']) {
        const before = saved[key] as { value: object; category: string } | null;
        if (before) await tx.platformSetting.update({ where: { key }, data: { value: before.value as object } });
        else await tx.platformSetting.deleteMany({ where: { key } });
      }
    });
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email: adminEmail } });
    await app.close();
  });

  it('the seller on an invoice and its receipt comes from Platform Settings', async () => {
    const billing = await setting('platform.billing', {
      tradeName: 'Acme Cloud POS',
      legalName: 'ACME SOFTWARE PRIVATE LIMITED',
      address: '12 Residency Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560025',
      gstin: '29AABCA1234F1Z5',
      panNumber: 'AABCA1234F',
      bankName: 'ICICI Bank',
      bankAccountName: 'ACME SOFTWARE PRIVATE LIMITED',
      bankAccountNumber: '000405001234',
      bankIfsc: 'ICIC0000004',
      upiId: 'acme@icici'
    });
    expect(billing.status, JSON.stringify(billing.body)).toBe(200);
    const brand = await setting('platform.branding', { supportEmail: 'help@acme.example', supportPhone: '+91 80 1234 5678' });
    expect(brand.status, JSON.stringify(brand.body)).toBe(200);

    const seller = (await invoice()).seller;
    expect(seller).toMatchObject({
      name: 'Acme Cloud POS',
      legalName: 'ACME SOFTWARE PRIVATE LIMITED',
      city: 'Bengaluru',
      state: 'Karnataka',
      gstin: '29AABCA1234F1Z5',
      pan: 'AABCA1234F',
      bankIfsc: 'ICIC0000004',
      upiId: 'acme@icici',
      supportEmail: 'help@acme.example',
      supportPhone: '+91 80 1234 5678'
    });

    await api('post', `/api/v1/invoices/${invoiceId}/payments`).send({ amount: 1000, method: 'UPI' });
    const receipt = await api('get', `/api/v1/invoices/${invoiceId}/receipt`);
    expect(receipt.status, JSON.stringify(receipt.body)).toBe(200);
    expect(receipt.body.seller.legalName).toBe('ACME SOFTWARE PRIVATE LIMITED');
  });

  it('GST follows the seller state: a Gujarat buyer now pays IGST to a Karnataka seller', async () => {
    const tax = (await invoice()).taxBreakup;
    expect(tax).toMatchObject({ isIntraState: false, igstRate: 18, cgst: 0, sgst: 0 });
  });

  it('and back to CGST + SGST when the seller is in the buyer\'s state', async () => {
    await setting('platform.billing', { state: 'Gujarat', gstin: '24AABCA1234F1Z5' });
    const tax = (await invoice()).taxBreakup;
    expect(tax).toMatchObject({ isIntraState: true, cgstRate: 9, sgstRate: 9, igst: 0 });
  });

  it('rejects a malformed GSTIN, IFSC or account number', async () => {
    expect((await setting('platform.billing', { gstin: 'NOTAGSTIN' })).status).toBe(400);
    expect((await setting('platform.billing', { bankIfsc: '1234' })).status).toBe(400);
    expect((await setting('platform.billing', { bankAccountNumber: 'abc' })).status).toBe(400);
    expect((await setting('platform.billing', { gstin: '27AABCA1234F1Z5', state: 'Gujarat' })).status).toBe(400);
  });

  it('every transactional email carries the support contact from branding', async () => {
    await setting('platform.branding', { supportEmail: 'help@acme.example', supportPhone: '+91 80 1234 5678', companyName: 'Acme Software' });
    const email = app.get(EmailService);
    // createTestApp() centrally mocks EmailService.send to capture OTP codes instead of really
    // sending; this test needs the REAL send() implementation (its HTML templating), so restore it
    // here first — this is the last test in the file, so nothing after it needs the OTP capture.
    vi.mocked(email.send).mockRestore();
    const sendMail = vi.fn().mockResolvedValue({});
    vi.spyOn(email as unknown as { getTransporter: () => unknown }, 'getTransporter').mockReturnValue({ sendMail });
    vi.spyOn(email, 'configured', 'get').mockReturnValue(true);

    expect(await email.send('owner@example.com', 'Hello', '<p>Body</p>')).toBe(true);
    const html = sendMail.mock.calls[0][0].html as string;
    expect(html).toContain('<p>Body</p>');
    expect(html).toContain('help@acme.example');
    expect(html).toContain('+91 80 1234 5678');
    expect(html).toContain('Acme Software');
  });
});
