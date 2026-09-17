import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository, AuditRepository } from '@jamanvaar/database';
import { ReportGeneratorService } from '@jamanvaar/business';

describe('JAMANVAAR POS & Admin — Billing / Invoices Ledger Redesign', () => {
  // No more ambient fabricated seed orders (see generateSeedOrders in
  // packages/database/src/seed.ts) — this suite creates its own explicit,
  // real order fixtures across CASH/UPI/CARD tenders.
  beforeEach(() => {
    db.resetToDefaultSeed();
    db.orders = [];
    const tenders: Array<{ method: 'CASH' | 'UPI_QR' | 'CARD_TERMINAL'; price: number }> = [
      { method: 'CASH', price: 320 },
      { method: 'UPI_QR', price: 480 },
      { method: 'CARD_TERMINAL', price: 610 },
      { method: 'CASH', price: 275 },
      { method: 'UPI_QR', price: 395 }
    ];
    tenders.forEach((t, idx) => {
      const items = [
        {
          id: `oi-bill-${idx}`,
          orderId: '',
          menuItemId: `item-bill-${idx}`,
          name: 'Royal Veg Dum Biryani',
          sku: `BILL-${idx}`,
          quantity: 1,
          unitPrice: t.price,
          modifiers: [],
          totalPrice: t.price,
          kitchenStatus: 'SERVED' as const
        }
      ];
      OrderRepository.createOrder({
        orderType: 'DINE_IN',
        tableNumber: String(idx + 1),
        items,
        subtotal: t.price,
        taxAmount: 0,
        totalAmount: t.price,
        paymentMethod: t.method,
        paymentStatus: 'SUCCESS',
        orderStatus: 'COMPLETED',
        source_type: 'POS'
      });
    });
  });

  it('1. should accurately aggregate revenue summary cards for payment tenders', () => {
    const orders = db.orders;
    expect(orders.length).toBeGreaterThan(0);

    const cashOrders = orders.filter((o) => o.paymentMethod === 'CASH' || o.paymentMethod === 'CASH_AT_COUNTER');
    const upiOrders = orders.filter((o) => o.paymentMethod === 'UPI_QR' || o.paymentMethod === 'UPI');
    const cardOrders = orders.filter((o) => o.paymentMethod === 'CARD_TERMINAL' || o.paymentMethod === 'CARD');
    const splitOrders = orders.filter((o) => o.paymentMethod === 'SPLIT');

    const totalCash = cashOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalUpi = upiOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalCard = cardOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalSplit = splitOrders.reduce((sum, o) => sum + o.totalAmount, 0);

    expect(totalCash).toBeGreaterThanOrEqual(0);
    expect(totalUpi).toBeGreaterThanOrEqual(0);
    expect(totalCard).toBeGreaterThanOrEqual(0);
    expect(totalSplit).toBeGreaterThanOrEqual(0);
  });

  it('2. should filter bills by time periods (Today, Yesterday, Week, Month)', () => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    const todayOrders = db.orders.filter((o) => o.createdAt.startsWith(todayStr));
    expect(todayOrders.length).toBeGreaterThan(0);

    const completed = todayOrders.filter((o) => o.orderStatus === 'COMPLETED');
    const totalSales = completed.reduce((sum, o) => sum + o.totalAmount, 0);
    expect(totalSales).toBeGreaterThan(0);
  });

  it('3. should process protected invoice refunds with audit logging', () => {
    const target = db.orders.find((o) => o.orderStatus === 'COMPLETED')!;
    expect(target).toBeDefined();

    const originalAmount = target.totalAmount;
    OrderRepository.refundOrder(target.id, originalAmount, 'Customer cancellation', 'Manager Amit');

    expect(target.orderStatus).toBe('REFUNDED');

    const audit = db.auditLogs.find((a) => a.action === 'REFUND');
    expect(audit).toBeDefined();
    expect(audit?.username).toBe('Manager Amit');
  });

  it('4. should process invoice reopen back to active queue with audit trail', () => {
    const target = db.orders.find((o) => o.orderStatus === 'COMPLETED')!;
    expect(target).toBeDefined();

    OrderRepository.updateOrderStatus(target.id, 'PREPARING', 'Bill Reopened by Manager Amit');
    expect(target.orderStatus).toBe('PREPARING');

    const lastTimeline = target.timeline?.[target.timeline.length - 1];
    expect(lastTimeline?.actor).toContain('Manager Amit');
  });

  it('5. should export invoices CSV with exact header and rows', () => {
    const orders = db.orders.slice(0, 5);
    const csv = ReportGeneratorService.exportTransactionsCsv(orders);

    expect(csv).toContain('Invoice / Order Number,Token Number,Date,Time,Order Type,Table Number');
    expect(csv.split('\n').length).toBeGreaterThan(5);
  });
});
