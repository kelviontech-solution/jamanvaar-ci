import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReportsService } from '../src/modules/reports/reports.service';

describe('EC-07/08/10: persisted financial and device health reports', () => {
  const prisma = new PrismaService();
  const reports = new ReportsService(prisma);
  let restaurantId: string;
  let branchId: string;
  const period = { from: '2026-10-01T00:00:00Z', to: '2026-10-31T23:59:59Z' };

  beforeAll(async () => {
    await prisma.onModuleInit();
    await prisma.runAsPlatform(async (tx) => {
      const restaurant = await tx.restaurant.create({ data: { name: 'Repair report fixture', restaurantCode: 'QA' + randomUUID(), timezone: 'UTC' } });
      restaurantId = restaurant.id;
      branchId = (await tx.branch.create({ data: { restaurantId, name: 'Kolkata', code: 'MAIN', timezone: 'Asia/Kolkata' } })).id;
      const order = await tx.syncedOrder.create({
        data: {
          restaurantId,
          branchId,
          externalOrderId: randomUUID(),
          source: 'QR',
          orderType: 'DINE_IN',
          status: 'COMPLETED',
          paymentStatus: 'PARTIALLY_REFUNDED',
          paymentMethod: 'CASH',
          subtotal: 10000,
          taxAmount: 0,
          discountAmount: 0,
          totalAmount: 10000,
          items: [],
          createdAt: new Date('2026-10-01T20:00:00Z'),
          meta: { refundAmountPaise: 9999 }
        }
      });
      await tx.orderPaymentEntry.createMany({
        data: [
          {
            restaurantId,
            branchId,
            orderId: order.id,
            kind: 'COLLECTION',
            amount: 10000,
            method: 'CASH',
            reference: randomUUID(),
            createdAt: new Date('2026-10-01T20:00:00Z')
          },
          {
            restaurantId,
            branchId,
            orderId: order.id,
            kind: 'REFUND',
            amount: 2000,
            method: 'CASH',
            reference: randomUUID(),
            createdAt: new Date('2026-10-03T12:00:00Z')
          }
        ]
      });
    });
  });
  afterAll(async () => {
    if (restaurantId) await prisma.runAsPlatform((tx) => tx.restaurant.delete({ where: { id: restaurantId } }));
    await prisma.onModuleDestroy();
  });

  it('uses the real ledger for a partial refund; does not reopen the paid bill', async () => {
    const report = await reports.getRestaurantSales(restaurantId, period);
    expect(report.totals).toMatchObject({
      orders: 1,
      grossSales: 100,
      refunds: 20,
      sales: 80,
      collections: 100,
      netCollections: 80,
      outstanding: 0,
      openOrders: 0,
      legacySettledOrders: 0
    });
    expect(report.byBranch[0]).toMatchObject({ branchId, sales: 80 });
    expect(report.byPaymentMethod[0]).toMatchObject({ method: 'CASH', sales: 80 });
  });
  it('groups UTC timestamps by branch calendar date independently of the database zone', async () => {
    const report = await reports.getRestaurantSales(restaurantId, period);
    expect(report.byDay).toEqual([{ date: '2026-10-02', orders: 1, sales: 80 }]);
    expect(report.dateBasis).toBe('BRANCH_LOCAL_CALENDAR_DATE');
  });
  it('does not pull a later refund into an earlier period end', async () => {
    const report = await reports.getRestaurantSales(restaurantId, { ...period, to: '2026-10-02T23:59:59Z' });
    expect(report.totals).toMatchObject({ sales: 100, refunds: 0, netCollections: 100, openOrders: 0 });
  });
  it('rejects invalid and reversed ranges before issuing report queries', async () => {
    await expect(reports.getRestaurantSales(restaurantId, { from: 'invalid' })).rejects.toThrow('Invalid sales date range');
    await expect(reports.getRestaurantSales(restaurantId, { from: period.to, to: period.from })).rejects.toThrow('Invalid sales date range');
  });
  it('counts stale active devices as offline and keeps revoked devices separate', async () => {
    const before = await reports.getSummary();
    await prisma.runAsPlatform((tx) =>
      tx.device.createMany({
        data: [
          { restaurantId, branchId, type: 'POS', name: 'offline repair', status: 'ACTIVE', lastSeenAt: new Date('2026-01-01') },
          { restaurantId, branchId, type: 'POS', name: 'revoked repair', status: 'REVOKED', lastSeenAt: new Date() },
          { restaurantId, branchId, type: 'POS', name: 'online repair', status: 'ACTIVE', lastSeenAt: new Date() }
        ]
      })
    );
    const after = await reports.getSummary();
    expect(after.devices.offline - before.devices.offline).toBe(1);
    expect(after.devices.revoked - before.devices.revoked).toBe(1);
    expect(after.devices.active - before.devices.active).toBe(1);
  });
});
