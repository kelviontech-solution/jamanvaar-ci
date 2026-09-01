import { describe, it, expect, beforeEach } from 'vitest';
import { EodReportService } from '@jamanvaar/business';
import { db } from '@jamanvaar/database';
import { EodReport } from '@jamanvaar/types';

describe('JAMANVAAR Restaurant Admin — Premium End of Day (EOD) Z-Report System', () => {
  it('should accurately calculate comprehensive EOD Z-Report from real database orders', () => {
    const report = EodReportService.generateEodReport(
      undefined,
      undefined,
      'Shift closed with all accounting ledger balanced.'
    );

    // 1. Report Metadata & Branding
    expect(report.id).toMatch(/^EOD-\d{8}-001$/);
    expect(report.branding.restaurantName).toBe('JAMANVAAR RESTAURANT');
    expect(report.branding.gstin).toBe('24ABCDE1234F1Z5');
    expect(report.branding.fssaiNumber).toBe('10722001000452');
    expect(report.branding.legalName).toContain('JAMANVAAR');

    // 2. Shift Information
    expect(report.cashierName).toBeDefined();
    expect(report.terminalId).toBe('POS-01');
    expect(report.openingFloat).toBeGreaterThanOrEqual(0);
    expect(report.closingFloat).toBeGreaterThanOrEqual(report.openingFloat);

    // 3. Daily Summary KPIs
    expect(report.grossRevenue).toBeGreaterThan(0);
    expect(report.netRevenue).toBeGreaterThan(0);
    expect(report.ordersSettled).toBeGreaterThan(0);
    expect(report.avgBillValue).toBeGreaterThan(0);
    expect(report.customersServed).toBeGreaterThan(0);
    expect(report.tablesServed).toBeGreaterThan(0);

    // 4. Sales Breakdown by Department
    expect(report.salesBreakdown.foodSales).toBeGreaterThan(0);
    expect(report.salesBreakdown.grossSales).toBe(report.grossRevenue);

    // 5. GST Tax Accounting Summary (2.5% + 2.5% = 5%)
    expect(report.gstSummary.cgstAmount).toBeGreaterThanOrEqual(0);
    expect(report.gstSummary.sgstAmount).toBeGreaterThanOrEqual(0);
    expect(report.gstSummary.totalTax).toBeCloseTo(
      report.gstSummary.cgstAmount + report.gstSummary.sgstAmount,
      2
    );

    // 6. Payment Settlement & Tenders
    expect(report.paymentSettlement.totalCollection).toBe(report.netRevenue);
    expect(report.paymentSettlement.cash.amount).toBeGreaterThanOrEqual(0);
    expect(report.paymentSettlement.upi.amount).toBeGreaterThanOrEqual(0);
    expect(report.paymentSettlement.card.amount).toBeGreaterThanOrEqual(0);

    // 7. Cash Drawer Reconciliation
    expect(report.cashDrawer.expectedDrawer).toBe(
      report.cashDrawer.openingFloat +
        report.cashDrawer.cashSales -
        report.cashDrawer.cashRefund -
        report.cashDrawer.cashPaidOut
    );
    expect(report.cashDrawer.isBalanced).toBe(true);

    // 8. Order Types Distribution
    expect(report.orderTypeSummary.dineIn + report.orderTypeSummary.takeaway + report.orderTypeSummary.delivery + report.orderTypeSummary.token).toBeGreaterThan(0);

    // 9. Top Selling Items (Ranked Top 10)
    expect(report.topSellingItems.length).toBeGreaterThan(0);
    expect(report.topSellingItems[0].rank).toBe(1);
    expect(report.topSellingItems[0].name).toBeDefined();
    expect(report.topSellingItems[0].quantity).toBeGreaterThan(0);

    // 10. Manager Notes & Signature Block
    expect(report.managerNotes).toBe('Shift closed with all accounting ledger balanced.');
    expect(report.generatedBy).toBeDefined();
  });

  it('should lock and persist official EOD snapshot to database without historical recalculation risk', () => {
    const report = EodReportService.generateEodReport();
    const saved = EodReportService.saveEodReport(report);

    expect(saved.status).toBe('LOCKED');
    expect(db.eodReports.some((r) => r.id === saved.id)).toBe(true);
  });

  it('should immediately update EOD Branding when Restaurant Settings are edited', () => {
    const originalName = db.restaurant.name;
    const originalGstin = db.restaurant.gstin;

    // Simulate owner editing settings
    db.restaurant.name = 'JAMANVAAR ROYAL HERITAGE';
    db.restaurant.gstin = '24XYZ9999P1Z9';

    const updatedReport = EodReportService.generateEodReport();
    expect(updatedReport.branding.restaurantName).toBe('JAMANVAAR ROYAL HERITAGE');
    expect(updatedReport.branding.gstin).toBe('24XYZ9999P1Z9');

    // Restore
    db.restaurant.name = originalName;
    db.restaurant.gstin = originalGstin;
  });
});
