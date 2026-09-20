import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository, BusinessDayRepository, isUnpaidOpenOrder } from '@jamanvaar/database';
import { CentralReportingService } from '@jamanvaar/business';
import type { Order } from '@jamanvaar/types';

/**
 * BUG-151 / BUG-161: an order that has only been sent to the kitchen (or a kiosk order "pay at counter") is
 * not money yet. It used to be counted as a completed sale and as cash / UPI collected as soon as it existed.
 */
describe('unpaid open orders are not sales', () => {
  beforeEach(() => db.resetToDefaultSeed());

  const item = { id: 'i1', orderId: '', menuItemId: 'm1', name: 'Paneer', quantity: 1, unitPrice: 280, modifiers: [], totalPrice: 280, kitchenStatus: 'PENDING' as const };
  const make = (over: Partial<Order>) =>
    OrderRepository.createOrder({
      idempotencyKey: `k-${Math.random()}`,
      orderType: 'DINE_IN',
      items: [{ ...item }],
      subtotal: 280,
      cgstAmount: 7,
      sgstAmount: 7,
      taxAmount: 14,
      totalAmount: 294,
      paymentMethod: 'CASH',
      orderStatus: 'CONFIRMED',
      ...over
    } as Partial<Order>);

  const todaySummary = () => CentralReportingService.calculateFinancialSummary(BusinessDayRepository.getOrdersForBusinessDay(BusinessDayRepository.getActiveBusinessDay().id));

  it('knows an unpaid open order from a paid or completed one', () => {
    expect(isUnpaidOpenOrder(make({ orderStatus: 'PREPARING', paymentStatus: 'PENDING' }))).toBe(true);
    expect(isUnpaidOpenOrder(make({ orderStatus: 'CONFIRMED', paymentStatus: 'PENDING', paymentMethod: 'CASH_AT_COUNTER' }))).toBe(true);
    expect(isUnpaidOpenOrder(make({ orderStatus: 'PREPARING', paymentStatus: 'SUCCESS' }))).toBe(false);
    expect(isUnpaidOpenOrder(make({ orderStatus: 'COMPLETED', paymentStatus: 'SUCCESS' }))).toBe(false);
    expect(isUnpaidOpenOrder(make({ orderStatus: 'CANCELLED', paymentStatus: 'PENDING' }))).toBe(false);
  });

  it('leaves an unpaid open order out of sales, orders and every payment total', () => {
    const before = todaySummary();
    make({ orderStatus: 'PREPARING', paymentStatus: 'PENDING', paymentMethod: 'CASH' });
    const after = todaySummary();
    expect(after.netSales).toBe(before.netSales);
    expect(after.ordersCount).toBe(before.ordersCount);
    expect(after.paymentBreakdown.cash).toBe(before.paymentBreakdown.cash);
    expect(after.paymentBreakdown.totalPayments).toBe(before.paymentBreakdown.totalPayments);
  });

  it('counts it once it is actually paid', () => {
    const before = todaySummary();
    const o = make({ orderStatus: 'PREPARING', paymentStatus: 'PENDING', paymentMethod: 'CASH' });
    OrderRepository.updateOrder(o.id, { paymentStatus: 'SUCCESS', orderStatus: 'COMPLETED' });
    const after = todaySummary();
    expect(after.netSales).toBe(before.netSales + 294);
    expect(after.ordersCount).toBe(before.ordersCount + 1);
    expect(after.paymentBreakdown.cash).toBe(before.paymentBreakdown.cash + 294);
  });

  it('a cash-at-counter kiosk order is not collected money until the cashier takes it (BUG-161)', () => {
    const before = todaySummary();
    make({ orderType: 'TAKEAWAY', orderStatus: 'CONFIRMED', paymentStatus: 'PENDING', paymentMethod: 'CASH_AT_COUNTER' });
    const after = todaySummary();
    expect(after.paymentBreakdown.cash).toBe(before.paymentBreakdown.cash);
    expect(after.paymentBreakdown.upi).toBe(before.paymentBreakdown.upi);
    expect(after.netSales).toBe(before.netSales);
  });

  it('the business day totals (POS footer, day close) ignore it too', () => {
    const day = BusinessDayRepository.getActiveBusinessDay();
    const before = BusinessDayRepository.recalculateMetrics(day.id)!;
    const beforeNet = before.netSales;
    const beforeCash = before.cashSales;
    make({ orderStatus: 'PREPARING', paymentStatus: 'PENDING', paymentMethod: 'CASH' });
    const after = BusinessDayRepository.recalculateMetrics(day.id)!;
    expect(after.netSales).toBe(beforeNet);
    expect(after.cashSales).toBe(beforeCash);
  });
});
