import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@jamanvaar/database';
import { CentralReportingService } from '@jamanvaar/business';
import { Order } from '@jamanvaar/types';

describe('JAMANVAAR POS — Critical Financial Reporting & Data Consistency Audit', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
  });

  it('1. should resolve consistent Asia/Kolkata date boundaries for all standard presets', () => {
    const todayRange = CentralReportingService.getBusinessDateRange('TODAY');
    const yesterdayRange = CentralReportingService.getBusinessDateRange('YESTERDAY');
    const weekRange = CentralReportingService.getBusinessDateRange('7_DAYS');
    const monthRange = CentralReportingService.getBusinessDateRange('THIS_MONTH');

    expect(todayRange.preset).toBe('TODAY');
    expect(todayRange.startDate.getHours()).toBe(0);
    expect(todayRange.startDate.getMinutes()).toBe(0);
    expect(todayRange.endDate.getHours()).toBe(23);
    expect(todayRange.endDate.getMinutes()).toBe(59);

    expect(yesterdayRange.startDate.getTime()).toBeLessThan(todayRange.startDate.getTime());
    expect(weekRange.startDate.getTime()).toBeLessThan(todayRange.startDate.getTime());
    expect(monthRange.startDate.getDate()).toBe(1);
  });

  it('2. should enforce exact 1:1 reconciliation between orders, bills, and payments (Variance = 0)', () => {
    const recon = CentralReportingService.reconcilePeriod(db.orders, 'TODAY');

    expect(recon.isReconciled).toBe(true);
    expect(recon.variance).toBe(0);
    expect(recon.mismatches).toHaveLength(0);

    // Dashboard, Bills, Reports and Payments must match 100%
    expect(recon.sources.dashboardSales).toBe(recon.sources.billsSales);
    expect(recon.sources.billsSales).toBe(recon.sources.reportsSales);
    expect(recon.sources.reportsSales).toBe(recon.sources.paymentSales);
  });

  it('3. should verify standard financial formulas: Taxable = Gross - Discounts, Net = Taxable + GST', () => {
    const todayRange = CentralReportingService.getBusinessDateRange('TODAY');
    const orders = CentralReportingService.getReportableOrders(db.orders, todayRange);
    const summary = CentralReportingService.calculateFinancialSummary(orders);

    expect(summary.taxableAmount).toBe(summary.grossSales - summary.discountAmount);
    expect(Math.abs(summary.netSales - (summary.taxableAmount + summary.totalTax))).toBeLessThanOrEqual(5);
    expect(summary.netCollected).toBe(summary.netSales - summary.refundsAmount);
    expect(summary.paymentBreakdown.totalPayments).toBe(summary.netSales);
    expect(summary.reconciled).toBe(true);
    expect(summary.varianceAmount).toBe(0);
  });

  it('4. should calculate AOV strictly as Net Sales divided by Completed Orders Count', () => {
    const todayRange = CentralReportingService.getBusinessDateRange('TODAY');
    const orders = CentralReportingService.getReportableOrders(db.orders, todayRange);
    const summary = CentralReportingService.calculateFinancialSummary(orders);

    if (summary.ordersCount > 0) {
      const expectedAov = Math.round(summary.netSales / summary.ordersCount);
      expect(summary.avgOrderValue).toBe(expectedAov);
    }
  });

  it('5. should accurately track full payment channel breakdown across Cash, UPI, Card and Split', () => {
    const todayRange = CentralReportingService.getBusinessDateRange('TODAY');
    const orders = CentralReportingService.getReportableOrders(db.orders, todayRange);
    const summary = CentralReportingService.calculateFinancialSummary(orders);

    const sumTenders =
      summary.paymentBreakdown.cash +
      summary.paymentBreakdown.upi +
      summary.paymentBreakdown.card +
      summary.paymentBreakdown.other;

    expect(sumTenders).toBe(summary.netSales);
  });
});
