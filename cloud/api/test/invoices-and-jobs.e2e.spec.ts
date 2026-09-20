import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * BUG-051 / 053: the invoice list was every invoice ever, filtered in the browser; the summary loaded
 * every row to add them up; "overdue" meant three different things; and the page claimed automation
 * that did not exist. Lists page on the server, totals are aggregates, overdue is one rule, and the
 * jobs that were only ever run by hand now exist and can be triggered and inspected.
 */
describe('Invoices listing, summary and scheduled jobs (BUG-051/053)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const email = `inv-owner-${stamp}@example.com`;
  const password = 'correct-horse-battery-staple';
  let token: string;
  let restaurantA: string;
  let restaurantB: string;
  const day = 86400_000;
  const ids: Record<string, string> = {};

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const api = (method: 'get' | 'post', url: string) => auth(request(app.getHttpServer())[method](url));

  async function invoice(key: string, rid: string, over: Record<string, unknown>) {
    const created = await prisma.runAsPlatform((tx) =>
      tx.invoice.create({
        data: {
          invoiceNumber: `TEST-${stamp}-${key}`,
          restaurantId: rid, amount: 1000, taxAmount: 180, totalAmount: 1180, status: 'ISSUED',
          billingPeriodStart: new Date(), billingPeriodEnd: new Date(Date.now() + 30 * day),
          dueDate: new Date(Date.now() + 5 * day), ...over
        } as never
      })
    );
    ids[key] = created.id;
    return created;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email, password });
    token = (await request(app.getHttpServer()).post('/api/v1/platform-auth/login').send({ email, password })).body.accessToken;
    const mk = async (label: string) =>
      (await api('post', '/api/v1/restaurants').send({ name: `TEST Inv ${label} ${stamp}`, ownerName: `Owner ${label}`, ownerEmail: `inv-${label}-${stamp}@example.com` })).body.restaurant.id as string;
    restaurantA = await mk('a');
    restaurantB = await mk('b');

    await invoice('current', restaurantA, {});                                   // 1180 due in 5 days
    await invoice('late40', restaurantA, { dueDate: new Date(Date.now() - 40 * day) });  // ISSUED, 40 days late
    await invoice('late10', restaurantA, { dueDate: new Date(Date.now() - 10 * day), status: 'PAST_DUE' });
    await invoice('paid', restaurantA, { status: 'PAID', paidAt: new Date() });
    await invoice('void', restaurantA, { status: 'VOID' });
    await invoice('other', restaurantB, {});
    await prisma.runAsPlatform((tx) =>
      tx.payment.create({ data: { invoiceId: ids.paid, restaurantId: restaurantA, amount: 1180, status: 'COMPLETED' } })
    );
  }, 60_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: { in: [restaurantA, restaurantB].filter(Boolean) } } }));
    await prisma.platformUser.deleteMany({ where: { email } });
    await app.close();
  });

  describe('list', () => {
    const list = (q: Record<string, string | number>) => api('get', '/api/v1/invoices').query(q);

    it('without a page it still returns the plain array', async () => {
      const res = await list({ restaurantId: restaurantA });
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(5);
    });

    it('pages on the server with the total and per-status counts for the scope', async () => {
      const res = await list({ restaurantId: restaurantA, page: 1, pageSize: 2 });
      expect(res.body.items).toHaveLength(2);
      expect(res.body).toMatchObject({ total: 5, totalPages: 3 });
      expect(res.body.statusCounts).toMatchObject({ ISSUED: 2, PAST_DUE: 1, PAID: 1, VOID: 1 });
    });

    it('searches by invoice number or restaurant name', async () => {
      expect((await list({ page: 1, q: `TEST-${stamp}-paid` })).body.items).toHaveLength(1);
      expect((await list({ page: 1, q: `TEST Inv b ${stamp}` })).body.total).toBe(1);
    });

    it('"overdue" means unpaid and past its due date, whatever the stored status says', async () => {
      const res = await list({ restaurantId: restaurantA, page: 1, overdue: 'true' });
      expect(res.body.items.map((i: { id: string }) => i.id).sort()).toEqual([ids.late40, ids.late10].sort());
    });
  });

  describe('summary', () => {
    it('computes overdue, amounts and collection rate from the same rule, in the database', async () => {
      const res = await api('get', '/api/v1/invoices/summary').query({ restaurantId: restaurantA });
      expect(res.status).toBe(200);
      // Overdue = the ISSUED invoice 40 days late + the PAST_DUE one; the current one is only pending.
      expect(res.body).toMatchObject({ overdueInvoices: 2, pendingInvoices: 1, paidInvoices: 1, overdueAmount: 23.6, pendingAmount: 35.4, totalCollected: 11.8 });
      // Collected 1180 of 4 billable invoices (void excluded) = 4720: by amount, not by count.
      expect(res.body.collectionRatePercent).toBe(25);
    });

    it('breaks unpaid overdue money into age buckets', async () => {
      const res = await api('get', '/api/v1/invoices/summary').query({ restaurantId: restaurantA });
      expect(res.body.ageing).toEqual({ '0-30': 11.8, '31-60': 11.8, '61-90': 0, '90+': 0 });
    });
  });

  describe('receivables', () => {
    it('gives one row per restaurant with what it owes, sorted by overdue amount', async () => {
      const res = await api('get', '/api/v1/invoices/receivables').query({ q: `TEST Inv ` });
      const a = res.body.find((r: { restaurantId: string }) => r.restaurantId === restaurantA);
      const b = res.body.find((r: { restaurantId: string }) => r.restaurantId === restaurantB);
      expect(a).toMatchObject({ restaurantName: `TEST Inv a ${stamp}`, outstanding: 35.4, overdue: 23.6, unpaidInvoices: 3 });
      expect(new Date(a.oldestDue).getTime()).toBeLessThan(Date.now() - 39 * day);
      expect(a.lastPaymentAt).toBeTruthy();
      expect(b).toMatchObject({ outstanding: 11.8, overdue: 0 });
      expect(res.body.indexOf(a)).toBeLessThan(res.body.indexOf(b));
    });
  });

  describe('scheduled jobs', () => {
    it('are only for people allowed to operate the platform', async () => {
      expect((await request(app.getHttpServer()).get('/api/v1/platform/jobs')).status).toBe(401);
    });

    it('marks unpaid invoices past their due date as PAST_DUE, expires keys and extensions, and reports what it did', async () => {
      const key = await prisma.runAsPlatform((tx) =>
        tx.activationKey.create({ data: { code: `JMV-T-${stamp}`, restaurantId: restaurantA, allowedDeviceType: 'POS', expiresAt: new Date(Date.now() - day) } })
      );
      const res = await api('post', '/api/v1/platform/jobs/run');
      expect(res.status).toBe(201);
      const byName = Object.fromEntries(res.body.results.map((r: { name: string }) => [r.name, r]));
      expect(byName['overdue-invoices'].ok).toBe(true);
      expect(byName['overdue-invoices'].result.marked).toBeGreaterThanOrEqual(1);
      expect(byName['expire-activation-keys'].result.expired).toBeGreaterThanOrEqual(1);
      expect(byName['expire-offline-extensions'].ok).toBe(true);

      const late40 = await prisma.runAsPlatform((tx) => tx.invoice.findUniqueOrThrow({ where: { id: ids.late40 } }));
      expect(late40.status).toBe('PAST_DUE');
      const current = await prisma.runAsPlatform((tx) => tx.invoice.findUniqueOrThrow({ where: { id: ids.current } }));
      expect(current.status).toBe('ISSUED');
      expect((await prisma.runAsPlatform((tx) => tx.activationKey.findUniqueOrThrow({ where: { id: key.id } }))).status).toBe('EXPIRED');
    });

    it('remembers when each job last ran and how it went', async () => {
      const res = await api('get', '/api/v1/platform/jobs');
      expect(res.status).toBe(200);
      expect(res.body.schedulerEnabled).toBe(false); // off under test, so runs are deterministic
      const job = res.body.jobs.find((j: { name: string }) => j.name === 'overdue-invoices');
      expect(job.lastRunAt).toBeTruthy();
      expect(job.lastOk).toBe(true);
    });
  });
});
