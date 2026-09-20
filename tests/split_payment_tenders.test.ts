import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository, ShiftRepository, BusinessDayRepository, getOrderTenders } from '@jamanvaar/database';

/**
 * BUG-040: the payment dialog knows exactly how much was paid by each method,
 * but `completePayment` only received the word 'SPLIT' and `settleOrder`
 * "assumed half cash, half UPI". A ₹504 bill paid ₹100 cash + ₹404 card was
 * booked as ₹252 cash + ₹252 UPI, corrupting shift totals, the expected cash in
 * the drawer, the day's tender mix and every report built on them.
 */
describe('split payments are recorded exactly as paid (BUG-040)', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
  });

  function pendingOrder(total: number) {
    const menuItem = db.menuItems[0];
    const item = {
      id: `oi-${Math.random()}`,
      orderId: '',
      menuItemId: menuItem.id,
      name: menuItem.name,
      sku: menuItem.sku || 'SKU',
      quantity: 1,
      unitPrice: total,
      modifiers: [],
      totalPrice: total,
      kitchenStatus: 'PENDING' as const
    };
    return OrderRepository.createOrder({
      items: [item],
      subtotal: total,
      totalAmount: total,
      source_type: 'POS',
      orderStatus: 'PREPARING',
      paymentStatus: 'PENDING'
    });
  }

  it('getOrderTenders splits an order by its recorded payment lines', () => {
    const order = { totalAmount: 504, paymentMethod: 'SPLIT', paymentSplits: [
      { method: 'CASH', amount: 100 },
      { method: 'CARD', amount: 404 }
    ] } as any;
    expect(getOrderTenders(order)).toMatchObject({ cash: 100, card: 404, upi: 0, wallet: 0, houseAccount: 0, other: 0 });
  });

  it('getOrderTenders maps a single-method order wholly to that method', () => {
    expect(getOrderTenders({ totalAmount: 378, paymentMethod: 'CASH' } as any).cash).toBe(378);
    expect(getOrderTenders({ totalAmount: 200, paymentMethod: 'UPI_QR' } as any).upi).toBe(200);
    expect(getOrderTenders({ totalAmount: 90, paymentMethod: 'CARD_TERMINAL' } as any).card).toBe(90);
  });

  it('getOrderTenders never invents a 50/50 split when the lines were not recorded', () => {
    const t = getOrderTenders({ totalAmount: 504, paymentMethod: 'SPLIT' } as any);
    expect(t.cash).toBe(0);
    expect(t.upi).toBe(0);
    expect(t.other).toBe(504);
  });

  it('settling a split books the real lines into the shift totals and expected cash', () => {
    // A fresh restaurant has no seeded/pre-opened shift (BUG-012) — open a real one.
    ShiftRepository.openShift('usr-test-cashier', 'Test Cashier', 2000);
    const shift = ShiftRepository.getActiveShift();
    expect(shift).toBeTruthy();
    const before = { cash: shift!.totalCashSales, upi: shift!.totalUpiSales, card: shift!.totalCardSales, expected: shift!.expectedCash };

    const order = pendingOrder(504);
    OrderRepository.settleOrder(order.id, 'SPLIT', 100, 'TXN-S1', 'Cashier', [
      { method: 'CASH', amount: 100 },
      { method: 'CARD', amount: 404 }
    ]);

    expect(shift!.totalCashSales - before.cash).toBe(100);
    expect(shift!.totalCardSales - before.card).toBe(404);
    expect(shift!.totalUpiSales - before.upi).toBe(0);
    expect(shift!.expectedCash - before.expected).toBe(100);
  });

  it('the settled order keeps its payment lines and the day totals use them', () => {
    const order = pendingOrder(504);
    const settled = OrderRepository.settleOrder(order.id, 'SPLIT', 100, 'TXN-S2', 'Cashier', [
      { method: 'CASH', amount: 100 },
      { method: 'CARD', amount: 404 }
    ]);
    expect(settled?.paymentSplits).toEqual([
      { method: 'CASH', amount: 100 },
      { method: 'CARD', amount: 404 }
    ]);

    const day = BusinessDayRepository.getActiveBusinessDay();
    BusinessDayRepository.recalculateMetrics(day.id);
    expect(day.cashSales).toBeGreaterThanOrEqual(100);
    expect(day.cardSales).toBeGreaterThanOrEqual(404);
    expect(day.cashSales + day.cardSales + day.upiSales + (day.otherPayments || 0)).toBe(day.netSales);
  });

  it('rejects payment lines that do not add up to the bill total', () => {
    const order = pendingOrder(504);
    expect(() =>
      OrderRepository.settleOrder(order.id, 'SPLIT', 100, 'TXN-S3', 'Cashier', [
        { method: 'CASH', amount: 100 },
        { method: 'CARD', amount: 300 }
      ])
    ).toThrow(/do not add up/i);
  });
});
