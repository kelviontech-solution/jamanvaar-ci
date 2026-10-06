import { describe, it, expect, beforeEach } from 'vitest';
import { DayOrdersService } from '@jamanvaar/business';
import { Order, OrderStatus } from '@jamanvaar/types';

describe('JAMANVAAR Restaurant Admin — Day-Wise Orders Module & Drill-Down', () => {
  const createMockOrder = (
    id: string,
    orderNumber: string,
    isoDateString: string,
    totalAmount: number,
    paymentMethod: 'CASH' | 'UPI_QR' | 'CARD_TERMINAL' | 'SPLIT',
    orderType: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'TOKEN',
    status: OrderStatus = 'COMPLETED'
  ): Order => ({
    id,
    orderNumber,
    tokenNumber: '101',
    restaurantId: 'rest-1',
    outletId: 'out-1',
    kioskId: 'POS-01',
    sessionId: `sess-${id}`,
    idempotencyKey: `idemp-${id}`,
    orderType,
    tableNumber: orderType === 'DINE_IN' ? '12' : undefined,
    customerName: 'Test Patron',
    customerPhone: '9876543210',
    cashierName: 'Amit Dave',
    captainName: 'Rahul Sharma',
    items: [
      {
        id: `oi-${id}-1`,
        orderId: id,
        menuItemId: 'item-pt',
        name: 'Paneer Tikka (Tandoori)',
        sku: 'PT',
        quantity: 2,
        unitPrice: 240,
        modifiers: [],
        totalPrice: 480,
        kitchenStatus: 'SERVED'
      }
    ],
    subtotal: 480,
    discountAmount: 0,
    cgstAmount: 12,
    sgstAmount: 12,
    taxAmount: 24,
    serviceChargeAmount: 0,
    tipAmount: 0,
    roundOffAmount: 0,
    totalAmount,
    paymentMethod,
    paymentStatus: status === 'CANCELLED' ? 'CANCELLED' : 'SUCCESS',
    orderStatus: status,
    estimatedWaitMinutes: 15,
    createdAt: isoDateString,
    updatedAt: isoDateString,
    isSynced: true
  });

  it('should correctly attribute late night orders (e.g. 01:30 AM) to previous business day', () => {
    // 01:30 AM local time on August 29 with 6:00 AM start hour belongs to August 28 business day
    const lateNightDate = new Date(2026, 7, 29, 1, 30, 0);
    const businessKey = DayOrdersService.getBusinessDateKey(lateNightDate, 6);
    expect(businessKey).toBe('2026-08-28');

    // 08:30 AM on August 29 belongs to August 29 business day
    const morningDate = new Date(2026, 7, 29, 8, 30, 0);
    const morningKey = DayOrdersService.getBusinessDateKey(morningDate, 6);
    expect(morningKey).toBe('2026-08-29');
  });

  it('should accurately aggregate day sales, payments, order types and AOV', () => {
    const orders: Order[] = [
      createMockOrder('ord-1', 'ORD-101', '2026-08-28T13:00:00.000Z', 1000, 'CASH', 'DINE_IN'),
      createMockOrder('ord-2', 'ORD-102', '2026-08-28T14:30:00.000Z', 1500, 'UPI_QR', 'DINE_IN'),
      createMockOrder('ord-3', 'ORD-103', '2026-08-28T19:00:00.000Z', 500, 'CARD_TERMINAL', 'TAKEAWAY'),
      createMockOrder('ord-4', 'ORD-104', '2026-08-28T21:00:00.000Z', 400, 'SPLIT', 'DELIVERY'),
      // Cancelled order should be counted in orderCount and cancelledList but not in total sales
      createMockOrder('ord-5', 'ORD-105', '2026-08-28T22:00:00.000Z', 600, 'CASH', 'DINE_IN', 'CANCELLED')
    ];

    const summary = DayOrdersService.getDaySummary(orders, '2026-08-28', 6);

    expect(summary.dateKey).toBe('2026-08-28');
    expect(summary.totalSales).toBe(3400); // 1000 + 1500 + 500 + 400
    expect(summary.orderCount).toBe(5);
    expect(summary.completedOrders).toBe(4);
    expect(summary.cancelledOrders).toBe(1);
    expect(summary.avgOrderValue).toBe(850); // 3400 / 4

    // Payment breakdown reconciliation
    expect(summary.paymentBreakdown.cash).toBe(1000);
    expect(summary.paymentBreakdown.upi).toBe(1500);
    expect(summary.paymentBreakdown.card).toBe(500);
    expect(summary.paymentBreakdown.split).toBe(400);

    // Order type breakdown reconciliation
    expect(summary.orderTypeBreakdown.dineIn).toBe(2);
    expect(summary.orderTypeBreakdown.takeaway).toBe(1);
    expect(summary.orderTypeBreakdown.delivery).toBe(1);

    // Top selling items
    expect(summary.topItems.length).toBeGreaterThan(0);
    expect(summary.topItems[0].name).toBe('Paneer Tikka (Tandoori)');
    expect(summary.topItems[0].quantity).toBe(8); // 2 * 4 completed orders
  });

  it('should support multi-day filter presets (TODAY, YESTERDAY, 7_DAYS, 30_DAYS, CUSTOM)', () => {
    const now = new Date();
    const todayKey = DayOrdersService.getBusinessDateKey(now, 6);

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = DayOrdersService.getBusinessDateKey(yesterday, 6);

    const orders: Order[] = [
      createMockOrder('ord-t1', 'ORD-T1', now.toISOString(), 1200, 'UPI_QR', 'DINE_IN'),
      createMockOrder('ord-y1', 'ORD-Y1', yesterday.toISOString(), 1800, 'CASH', 'DINE_IN')
    ];

    const todaySummaries = DayOrdersService.getAllDaysSummaries(orders, 'TODAY');
    expect(todaySummaries.length).toBe(1);
    expect(todaySummaries[0].dateKey).toBe(todayKey);
    expect(todaySummaries[0].totalSales).toBe(1200);

    const yesterdaySummaries = DayOrdersService.getAllDaysSummaries(orders, 'YESTERDAY');
    expect(yesterdaySummaries.length).toBe(1);
    expect(yesterdaySummaries[0].dateKey).toBe(yesterdayKey);
    expect(yesterdaySummaries[0].totalSales).toBe(1800);

    const sevenDaysSummaries = DayOrdersService.getAllDaysSummaries(orders, '7_DAYS');
    expect(sevenDaysSummaries.length).toBeGreaterThanOrEqual(2);
  });

  it('should generate valid CSV exports for day orders and multi-day reports', () => {
    const orders: Order[] = [
      createMockOrder('ord-1', 'ORD-9969', '2026-08-28T13:00:00.000Z', 719, 'UPI_QR', 'DINE_IN')
    ];

    const summary = DayOrdersService.getDaySummary(orders, '2026-08-28', 6);
    const dayCsv = DayOrdersService.exportDayOrdersCsv(summary);

    expect(dayCsv).toContain('Order #');
    expect(dayCsv).toContain('ORD-9969');
    expect(dayCsv).toContain('UPI_QR');

    const multiDayCsv = DayOrdersService.exportAllDaysCsv([summary]);
    expect(multiDayCsv).toContain('Date Key');
    expect(multiDayCsv).toContain('2026-08-28');
  });
});

describe('Open (unpaid) bills are shown beside gross sales, not inside them', () => {
  it('a bill still open and unpaid is counted as open, and left out of gross sales', () => {
    const when = new Date(2026, 7, 29, 12, 0, 0).toISOString();
    const paid = {
      id: 'paid-1', orderNumber: 'P1', tokenNumber: '1', restaurantId: 'r', outletId: 'o', kioskId: 'POS-01', sessionId: 's1', idempotencyKey: 'i1',
      orderType: 'DINE_IN', items: [], subtotal: 400, discountAmount: 0, cgstAmount: 10, sgstAmount: 10, taxAmount: 20,
      serviceChargeAmount: 0, tipAmount: 0, roundOffAmount: 0, totalAmount: 420, paymentMethod: 'CASH', paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED', estimatedWaitMinutes: 15, createdAt: when, updatedAt: when, isSynced: true
    } as never;
    const open = { ...(paid as object), id: 'open-1', orderNumber: 'O1', paymentStatus: 'PENDING', paymentMethod: 'UPI_QR', orderStatus: 'CONFIRMED', totalAmount: 300, subtotal: 300, taxAmount: 0, cgstAmount: 0, sgstAmount: 0 } as never;
    const summary = DayOrdersService.getDaySummary([paid, open], '2026-08-29', 6);
    expect(summary.openBills).toBe(300);
    expect(summary.grossSales).toBe(400);
  });
});
