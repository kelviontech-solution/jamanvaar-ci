import { describe, it, expect, beforeEach } from 'vitest';
import { db, BusinessDayRepository, KOTRepository } from '@jamanvaar/database';
import { ReportDataEngine, ReportDateRange } from '../apps/restaurant-system/pos-admin/src/components/reports/reportDataEngine';
import { Order, KOTItem } from '@jamanvaar/types';

/**
 * Covers two report-preview functions that used to fabricate their numbers:
 * getEodReconciliation always assumed a ₹2000 opening float, zero cash
 * drops, and an "actual cash counted" forced to equal expected cash (so the
 * drawer could never show a real variance). getStationPerformance produced
 * a random average prep time and floored zero-activity stations up to a
 * fake non-zero count. Both now read real db.businessDays / db.kots state.
 */
describe('ReportDataEngine — EOD reconciliation reads real business-day cash state', () => {
  beforeEach(() => {
    db.orders = [];
    db.businessDays = [];
    db.kots = [];
  });

  const rangeCoveringNow = (): ReportDateRange => ({
    startDate: new Date(Date.now() - 60 * 60 * 1000),
    endDate: new Date(Date.now() + 60 * 60 * 1000),
    preset: 'TODAY',
    label: 'Today'
  });

  it('uses the active business day real opening cash instead of a hardcoded 2000', () => {
    const activeDay = BusinessDayRepository.getActiveBusinessDay();
    activeDay.openingCash = 5000;
    activeDay.cashIn = 300;
    activeDay.cashOut = 100;

    const order: Order = {
      id: 'ord-1', orderNumber: 'ORD-1', tokenNumber: '1', createdAt: new Date().toISOString(),
      orderType: 'DINE_IN', items: [], subtotal: 1000, discountAmount: 0, cgstAmount: 25, sgstAmount: 25,
      taxAmount: 50, roundOffAmount: 0, totalAmount: 1000, paymentMethod: 'CASH', paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED', businessDayId: activeDay.id
    } as unknown as Order;

    const eod = ReportDataEngine.getEodReconciliation([order], rangeCoveringNow());
    expect(eod.openingCash).toBe(5000);
    expect(eod.cashSales).toBe(1000);
    expect(eod.expectedCash).toBe(5000 + 1000 + 300 - 100);
  });

  it('reports actualCashCounted / isBalanced as null when the day has not been closed yet, instead of faking a balanced drawer', () => {
    BusinessDayRepository.getActiveBusinessDay();
    const eod = ReportDataEngine.getEodReconciliation([], rangeCoveringNow());
    expect(eod.actualCashCounted).toBeNull();
    expect(eod.cashDifference).toBeNull();
    expect(eod.isBalanced).toBeNull();
  });

  it('reports a real variance once the covered business day is actually closed with a short cash count', () => {
    const activeDay = BusinessDayRepository.getActiveBusinessDay();
    activeDay.openingCash = 2000;
    activeDay.status = 'CLOSED';
    activeDay.closingCash = 1800; // manager counted 200 short

    const eod = ReportDataEngine.getEodReconciliation([], rangeCoveringNow());
    expect(eod.actualCashCounted).toBe(1800);
    expect(eod.expectedCash).toBe(2000);
    expect(eod.cashDifference).toBe(-200);
    expect(eod.isBalanced).toBe(false);
  });
});

describe('ReportDataEngine — station performance derives real prep time from KOT timestamps', () => {
  beforeEach(() => {
    db.orders = [];
    db.kots = [];
  });

  it('returns zero counts (not a fake floor of 1/2) for a station with no activity in range', () => {
    const stations = ReportDataEngine.getStationPerformance([]);
    const tandoor = stations.find((s) => s.stationName === 'Tandoor Section')!;
    expect(tandoor.kotCount).toBe(0);
    expect(tandoor.itemsCount).toBe(0);
    expect(tandoor.avgPrepMinutes).toBeNull();
  });

  it('computes a real average prep time from KOT createdAt -> readyAt instead of a random number', () => {
    const order: Order = {
      id: 'ord-tandoor-1', orderNumber: 'ORD-500', tokenNumber: '5', createdAt: new Date().toISOString(),
      orderType: 'DINE_IN',
      items: [{ id: 'oi-1', orderId: 'ord-tandoor-1', menuItemId: 'item-pt', name: 'Paneer Tikka', sku: 'PT-04', modifiers: [], quantity: 1, unitPrice: 260, totalPrice: 260, kitchenStatus: 'PENDING' }],
      subtotal: 260, discountAmount: 0, cgstAmount: 6.5, sgstAmount: 6.5, taxAmount: 13, roundOffAmount: 0,
      totalAmount: 260, paymentMethod: 'CASH', paymentStatus: 'SUCCESS', orderStatus: 'COMPLETED'
    } as unknown as Order;
    db.orders.push(order);

    const kots = KOTRepository.generateKOT({
      orderId: order.id, orderNumber: order.orderNumber, tokenNumber: order.tokenNumber,
      orderType: 'DINE_IN', cashierName: 'Test',
      items: [{ id: 'ki-1', menuItemId: 'item-pt', name: 'Paneer Tikka', quantity: 1, modifiers: [], kitchenStation: 'Tandoor Section', status: 'PREPARING' } as KOTItem]
    });

    const createdAtMs = new Date(kots[0].createdAt).getTime();
    KOTRepository.updateKOTStatus(kots[0].id, 'READY');
    const kot = db.kots.find((k) => k.id === kots[0].id)!;
    // Force a known elapsed time rather than depending on real clock drift in the test run.
    kot.readyAt = new Date(createdAtMs + 8 * 60000).toISOString();

    const stations = ReportDataEngine.getStationPerformance([order]);
    const tandoor = stations.find((s) => s.stationName === 'Tandoor Section')!;
    expect(tandoor.kotCount).toBe(1);
    expect(tandoor.itemsCount).toBe(1);
    expect(tandoor.avgPrepMinutes).toBe(8);
  });
});
