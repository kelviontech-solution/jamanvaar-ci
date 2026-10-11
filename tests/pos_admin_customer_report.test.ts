import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository } from '@jamanvaar/database';
import { ReportDataEngine, ReportDateRange } from '../apps/restaurant-system/pos-admin/src/components/reports/reportDataEngine';
import { Order } from '@jamanvaar/types';

const rangeCoveringNow = (): ReportDateRange => ({
  startDate: new Date(Date.now() - 60 * 60 * 1000),
  endDate: new Date(Date.now() + 60 * 60 * 1000),
  preset: 'TODAY',
  label: 'Today'
});

describe('ReportDataEngine.getCustomerReport', () => {
  beforeEach(() => {
    db.orders = [];
    db.customerAccounts = [];
  });

  it('counts an order with no customerPhone as unmatched, not silently dropped', () => {
    const order = OrderRepository.createOrder({
      idempotencyKey: `k-${Math.random()}`, orderType: 'TAKEAWAY', items: [],
      subtotal: 200, cgstAmount: 5, sgstAmount: 5, taxAmount: 10, totalAmount: 210,
      paymentMethod: 'CASH', orderStatus: 'COMPLETED', paymentStatus: 'SUCCESS'
    } as Partial<Order>);

    const report = ReportDataEngine.getCustomerReport([order]);
    expect(report.matchedOrders).toBe(0);
    expect(report.unmatchedOrders).toBe(1);
    expect(report.topSpenders).toHaveLength(0);
  });

  it('counts an order whose customerPhone has no CustomerAccount record as unmatched too', () => {
    const order = OrderRepository.createOrder({
      idempotencyKey: `k-${Math.random()}`, orderType: 'TAKEAWAY', items: [],
      subtotal: 200, cgstAmount: 5, sgstAmount: 5, taxAmount: 10, totalAmount: 210,
      paymentMethod: 'CASH', orderStatus: 'COMPLETED', paymentStatus: 'SUCCESS',
      customerPhone: '9999999999'
    } as Partial<Order>);
    // OrderRepository.createOrder auto-enrolls a successful order's customerPhone into loyalty via
    // CustomerRepository.getOrCreateAccount — a real side effect, not a test artifact. Removing the
    // account afterward is what actually constructs the "phone with no account record" scenario
    // this test means to check (e.g. a device whose customerAccounts fell out of sync).
    db.customerAccounts = db.customerAccounts.filter((c) => c.phone !== '9999999999');

    const report = ReportDataEngine.getCustomerReport([order]);
    expect(report.matchedOrders).toBe(0);
    expect(report.unmatchedOrders).toBe(1);
  });

  it('matches an order to its CustomerAccount, sums spend in range, and ranks top spenders', () => {
    db.customerAccounts.push({
      phone: '8888888888', name: 'Asha Patel', loyaltyPoints: 0, favoriteItemIds: [], recentOrderIds: [],
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    });
    const orderA = OrderRepository.createOrder({
      idempotencyKey: `k-${Math.random()}`, orderType: 'TAKEAWAY', items: [],
      subtotal: 500, cgstAmount: 12.5, sgstAmount: 12.5, taxAmount: 25, totalAmount: 525,
      paymentMethod: 'CASH', orderStatus: 'COMPLETED', paymentStatus: 'SUCCESS',
      customerPhone: '8888888888'
    } as Partial<Order>);
    const orderB = OrderRepository.createOrder({
      idempotencyKey: `k-${Math.random()}`, orderType: 'TAKEAWAY', items: [],
      subtotal: 300, cgstAmount: 7.5, sgstAmount: 7.5, taxAmount: 15, totalAmount: 315,
      paymentMethod: 'CASH', orderStatus: 'COMPLETED', paymentStatus: 'SUCCESS',
      customerPhone: '8888888888'
    } as Partial<Order>);

    const report = ReportDataEngine.getCustomerReport([orderA, orderB]);
    expect(report.matchedOrders).toBe(2);
    expect(report.unmatchedOrders).toBe(0);
    expect(report.topSpenders[0].phone).toBe('8888888888');
    expect(report.topSpenders[0].ordersInRange).toBe(2);
    expect(report.topSpenders[0].spendInRange).toBe(840);
    expect(report.topSpenders[0].name).toBe('Asha Patel');
  });

  it('classifies a customer created inside the range as new, and one created before it as repeat', () => {
    const now = new Date();
    db.customerAccounts.push(
      { phone: '7000000001', name: 'New Guest', loyaltyPoints: 0, favoriteItemIds: [], recentOrderIds: [], createdAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString() },
      { phone: '7000000002', name: 'Regular', loyaltyPoints: 0, favoriteItemIds: [], recentOrderIds: [], createdAt: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString() }
    );
    const o1 = OrderRepository.createOrder({ idempotencyKey: `k-${Math.random()}`, orderType: 'TAKEAWAY', items: [], subtotal: 100, cgstAmount: 2.5, sgstAmount: 2.5, taxAmount: 5, totalAmount: 105, paymentMethod: 'CASH', orderStatus: 'COMPLETED', paymentStatus: 'SUCCESS', customerPhone: '7000000001' } as Partial<Order>);
    const o2 = OrderRepository.createOrder({ idempotencyKey: `k-${Math.random()}`, orderType: 'TAKEAWAY', items: [], subtotal: 100, cgstAmount: 2.5, sgstAmount: 2.5, taxAmount: 5, totalAmount: 105, paymentMethod: 'CASH', orderStatus: 'COMPLETED', paymentStatus: 'SUCCESS', customerPhone: '7000000002' } as Partial<Order>);

    const report = ReportDataEngine.getCustomerReport([o1, o2], rangeCoveringNow());
    expect(report.newCustomers).toBe(1);
    expect(report.repeatCustomers).toBe(1);
  });

  it('reports avgSpendPerVisit as a MetricWithVariance built from matched orders only', () => {
    const report = ReportDataEngine.getCustomerReport([]);
    expect(report.avgSpendPerVisit.current).toBe(0);
    expect(report.matchedOrders).toBe(0);
  });
});
