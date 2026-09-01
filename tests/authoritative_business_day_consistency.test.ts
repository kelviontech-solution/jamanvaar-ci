import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  BusinessDayRepository,
  BusinessDayAccountingService,
  OrderRepository,
  ShiftRepository
} from '../shared/database/src';
import { CentralReportingService, ReportGeneratorService } from '../shared/business/src';
import { Order, BusinessDay } from '../shared/types/src';

describe('Authoritative Single-Source-of-Truth Business Day & Financial Accounting Suite', () => {
  beforeEach(() => {
    // Reset database to a clean testing state
    db.resetToDefaultSeed();
  });

  it('1. Authoritative Accounting: Active Business Day correctly binds orders across payment methods', () => {
    const activeDay = BusinessDayAccountingService.getActiveBusinessDay();
    expect(activeDay.status).toBe('OPEN');

    // Create 3 orders with different payment methods
    const ord1 = OrderRepository.createOrder({
      subtotal: 100,
      discountAmount: 0,
      totalAmount: 100,
      orderType: 'DINE_IN',
      paymentMethod: 'CASH',
      paymentStatus: 'SUCCESS',
      source_type: 'POS'
    });

    const ord2 = OrderRepository.createOrder({
      subtotal: 200,
      discountAmount: 0,
      totalAmount: 200,
      orderType: 'TAKEAWAY',
      paymentMethod: 'UPI',
      paymentStatus: 'SUCCESS',
      source_type: 'POS'
    });

    const ord3 = OrderRepository.createOrder({
      subtotal: 300,
      discountAmount: 0,
      totalAmount: 300,
      orderType: 'DELIVERY',
      paymentMethod: 'CARD',
      paymentStatus: 'SUCCESS',
      source_type: 'POS'
    });

    // Verify each order is bound to the active business day
    expect(ord1.businessDayId).toBe(activeDay.id);
    expect(ord2.businessDayId).toBe(activeDay.id);
    expect(ord3.businessDayId).toBe(activeDay.id);

    // Fetch authoritative summary from BusinessDayAccountingService
    const summary = BusinessDayAccountingService.getBusinessDaySummary(activeDay.id);
    expect(summary.business_day_id).toBe(activeDay.id);
    expect(summary.cash_sales).toBeGreaterThanOrEqual(100);
    expect(summary.upi_sales).toBeGreaterThanOrEqual(200);
    expect(summary.card_sales).toBeGreaterThanOrEqual(300);

    // Verify CentralReportingService matches exactly
    const centralDash = CentralReportingService.getDashboardMetrics('TODAY');
    expect(centralDash.summary.netSales).toBe(summary.net_sales);
    expect(centralDash.summary.paymentBreakdown.cash).toBe(summary.cash_sales);
    expect(centralDash.summary.paymentBreakdown.upi).toBe(summary.upi_sales);
    expect(centralDash.summary.paymentBreakdown.card).toBe(summary.card_sales);
  });

  it('2. EOD Closing & Next Day Transition: Old day finalized, new day initialized with 0 counters', () => {
    const activeDay = BusinessDayAccountingService.getActiveBusinessDay();
    const currentSalesBeforeClose = BusinessDayAccountingService.getBusinessDaySummary(activeDay.id).net_sales;

    // Close active business day
    const closedDay = BusinessDayRepository.closeBusinessDay(
      activeDay.id,
      2000 + BusinessDayAccountingService.getBusinessDaySummary(activeDay.id).cash_sales,
      'Amit Dave (Lead Cashier)',
      'Balanced'
    );

    expect(closedDay.status).toBe('CLOSED');
    expect(closedDay.closedAt).toBeTruthy();
    expect(closedDay.snapshot).toBeDefined();

    // Start New Business Day
    const newDay = BusinessDayRepository.openNewBusinessDay('Amit Dave (Lead Cashier)', 2000);
    expect(newDay.id).not.toBe(closedDay.id);
    expect(newDay.status).toBe('OPEN');

    // Authoritative summary for the new day must start at 0
    const newDaySummary = BusinessDayAccountingService.getBusinessDaySummary(newDay.id);
    expect(newDaySummary.net_sales).toBe(0);
    expect(newDaySummary.total_orders).toBe(0);
    expect(newDaySummary.completed_orders).toBe(0);

    // Create a new order in Day 2
    const ordDay2 = OrderRepository.createOrder({
      subtotal: 400,
      totalAmount: 400,
      orderType: 'DINE_IN',
      paymentMethod: 'CASH',
      paymentStatus: 'SUCCESS',
      source_type: 'POS'
    });

    expect(ordDay2.businessDayId).toBe(newDay.id);

    // New day sales must be 400
    const updatedNewDaySummary = BusinessDayAccountingService.getBusinessDaySummary(newDay.id);
    expect(updatedNewDaySummary.net_sales).toBe(400);
    expect(updatedNewDaySummary.cash_sales).toBe(400);

    // Historical day sales must remain intact
    const historicalDaySummary = BusinessDayAccountingService.getBusinessDaySummary(closedDay.id);
    expect(historicalDaySummary.net_sales).toBe(currentSalesBeforeClose);
  });

  it('3. Midnight Boundary: Orders placed past midnight stay attached to the open business day', () => {
    const activeDay = BusinessDayAccountingService.getActiveBusinessDay();

    // Simulate order created at 11:59 PM
    const ordMidnightEve = OrderRepository.createOrder({
      subtotal: 150,
      totalAmount: 150,
      orderType: 'DINE_IN',
      paymentMethod: 'CASH',
      paymentStatus: 'SUCCESS',
      source_type: 'POS',
      createdAt: '2026-08-31T23:59:00.000Z'
    });

    // Simulate order created at 12:05 AM while business day is still OPEN
    const ordPastMidnight = OrderRepository.createOrder({
      subtotal: 250,
      totalAmount: 250,
      orderType: 'DINE_IN',
      paymentMethod: 'UPI',
      paymentStatus: 'SUCCESS',
      source_type: 'POS',
      createdAt: '2026-09-01T00:05:00.000Z'
    });

    expect(ordMidnightEve.businessDayId).toBe(activeDay.id);
    expect(ordPastMidnight.businessDayId).toBe(activeDay.id);

    const summary = BusinessDayAccountingService.getBusinessDaySummary(activeDay.id);
    expect(summary.total_orders).toBeGreaterThanOrEqual(2);
  });

  it('4. Separation of Cashier Shift and Restaurant Business Day', () => {
    const activeDay = BusinessDayAccountingService.getActiveBusinessDay();
    const activeShift = ShiftRepository.getActiveShift();

    expect(activeShift).toBeDefined();
    expect(activeDay.id).toBeDefined();

    // Closing a shift should NOT close the business day
    ShiftRepository.closeShift(activeShift.id, 2000, 'Amit Dave');

    const freshActiveDay = BusinessDayAccountingService.getActiveBusinessDay();
    expect(freshActiveDay.status).toBe('OPEN');
    expect(freshActiveDay.id).toBe(activeDay.id);
  });
});
