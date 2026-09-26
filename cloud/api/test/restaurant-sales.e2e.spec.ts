import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, createTestPlatformUser, platformLogin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * BUG-041: Super Admin's per-restaurant reports showed only the platform's own SaaS invoices, never
 * the restaurant's real sales. Synced orders now feed a separate, clearly labelled sales report.
 */
describe('Restaurant sales report for Super Admin (BUG-041)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const email = `sales-owner-${stamp}@example.com`;
  const password = 'correct-horse-battery-staple';
  let token: string;
  let restaurantId: string;
  let branchId: string;
  const day = 86400_000;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const sales = (q: Record<string, string> = {}) => auth(request(app.getHttpServer()).get(`/api/v1/platform/reports/restaurants/${restaurantId}/sales`)).query(q);

  async function order(key: string, over: Record<string, unknown>) {
    await prisma.runAsPlatform((tx) =>
      tx.syncedOrder.create({
        data: {
          restaurantId, externalOrderId: `sales-${stamp}-${key}`, orderType: 'DINE_IN', status: 'COMPLETED',
          items: [{ name: 'Paneer Tikka', quantity: 2, lineTotal: 40000 }, { name: 'Tea', quantity: 1, lineTotal: 5000 }],
          subtotal: 45000, taxAmount: 2250, discountAmount: 0, totalAmount: 47250, paymentStatus: 'SUCCESS', paymentMethod: 'CASH',
          // Set explicitly, a moment in the past: rows stamped by the database clock can land after the report's own `now` when the
          // database and this process disagree by a few milliseconds, and would silently drop out of the range.
          createdAt: new Date(Date.now() - 60_000), ...over
        } as never
      })
    );
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await createTestPlatformUser(prisma, { email, password });
    token = (await platformLogin(app, email, password)).body.accessToken;
    restaurantId = (await auth(request(app.getHttpServer()).post('/api/v1/restaurants')).send({
      name: `TEST Sales ${stamp}`, mobile: `9${String(stamp).slice(-9)}`, ownerName: 'Owner', ownerEmail: `sales-${stamp}@example.com`
    })).body.restaurant.id;
    branchId = (await auth(request(app.getHttpServer()).post('/api/v1/branches')).send({ restaurantId, name: 'Sales Branch', code: 'SB' })).body.id;

    await order('a', {});                                                              // 472.50 cash, today
    await order('b', { paymentMethod: 'UPI', totalAmount: 30000, branchId });          // 300.00 upi, branch
    await order('c', { createdAt: new Date(Date.now() - 3 * day), totalAmount: 10000 });// 100.00 cash, 3 days ago
    await order('d', { paymentStatus: 'PENDING', totalAmount: 99900 });                // unpaid: not sales
    await order('e', { status: 'CANCELLED', totalAmount: 77700 });                     // cancelled: not sales
  }, 60_000);

  afterAll(async () => {
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: restaurantId } }));
    await prisma.platformUser.deleteMany({ where: { email } });
    await app.close();
  });

  it('counts only paid, non-cancelled orders as sales, in rupees, and says how many are still open', async () => {
    const res = await sales();
    expect(res.status).toBe(200);
    expect(res.body.totals).toMatchObject({ orders: 3, sales: 872.5, averageOrder: 290.83, openOrders: 1, cancelledOrders: 1 });
  });

  it('breaks sales down by day, payment method, branch and top items', async () => {
    const res = await sales();
    expect(res.body.byPaymentMethod).toEqual(expect.arrayContaining([
      { method: 'CASH', orders: 2, sales: 572.5 }, { method: 'UPI', orders: 1, sales: 300 }
    ]));
    expect(res.body.byDay).toHaveLength(2);
    const branch = res.body.byBranch.find((b: { branchId: string | null }) => b.branchId === branchId);
    expect(branch).toMatchObject({ branchName: 'Sales Branch', orders: 1, sales: 300 });
    expect(res.body.byBranch.find((b: { branchId: string | null }) => b.branchId === null)).toMatchObject({ branchName: 'Unassigned', orders: 2 });
    expect(res.body.topItems[0]).toMatchObject({ name: 'Paneer Tikka', quantity: 6, revenue: 1200 });
  });

  it('respects a date range', async () => {
    const from = new Date(Date.now() - 1 * day).toISOString();
    const res = await sales({ from });
    expect(res.body.totals.orders).toBe(2);
    expect(res.body.totals.sales).toBe(772.5);
  });

  it('is labelled apart from the platform\'s own invoices', async () => {
    const res = await sales();
    expect(res.body.source).toBe('RESTAURANT_SYNCED_ORDERS');
    expect(res.body.note).toMatch(/not the platform's invoices/i);
  });

  it('says so when a restaurant has synced nothing, instead of showing zeros as if they were real', async () => {
    const other = (await auth(request(app.getHttpServer()).post('/api/v1/restaurants')).send({ name: `TEST Sales Empty ${stamp}`, mobile: `8${String(stamp).slice(-9)}`, ownerName: 'O2', ownerEmail: `sales-empty-${stamp}@example.com` })).body.restaurant.id;
    const res = await auth(request(app.getHttpServer()).get(`/api/v1/platform/reports/restaurants/${other}/sales`));
    expect(res.body.hasData).toBe(false);
    await prisma.runAsPlatform((tx) => tx.restaurant.deleteMany({ where: { id: other } }));
  });
});
