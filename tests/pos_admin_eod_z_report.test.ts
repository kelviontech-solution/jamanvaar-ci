import { describe, it, expect, beforeEach } from 'vitest';
import { EodReportService } from '@jamanvaar/business';
import { db, OrderRepository } from '@jamanvaar/database';
import { EodReport } from '@jamanvaar/types';

describe('JAMANVAAR Restaurant Admin — Premium End of Day (EOD) Z-Report System', () => {
  // The database no longer ships with ~77 fabricated historical orders (see
  // packages/database/src/seed.ts's generateSeedOrders — it used to invent
  // an entire day's sales on every fresh install). This suite tests real
  // report aggregation, so it creates its own explicit, real-looking orders.
  beforeEach(() => {
    db.orders = [];
    const fixtures: Array<{ orderType: 'DINE_IN' | 'TAKEAWAY'; tableNumber?: string; paymentMethod: 'CASH' | 'UPI_QR' | 'CARD_TERMINAL'; itemName: string; itemPrice: number; qty: number }> = [
      { orderType: 'DINE_IN', tableNumber: '3', paymentMethod: 'CASH', itemName: 'Paneer Tikka', itemPrice: 240, qty: 2 },
      { orderType: 'DINE_IN', tableNumber: '5', paymentMethod: 'UPI_QR', itemName: 'Royal Veg Dum Biryani', itemPrice: 280, qty: 1 },
      { orderType: 'TAKEAWAY', paymentMethod: 'CARD_TERMINAL', itemName: 'Butter Naan', itemPrice: 60, qty: 4 }
    ];
    fixtures.forEach((f, idx) => {
      const items = [
        {
          id: `oi-eod-${idx}`,
          orderId: '',
          menuItemId: `item-eod-${idx}`,
          name: f.itemName,
          sku: `EOD-${idx}`,
          quantity: f.qty,
          unitPrice: f.itemPrice,
          modifiers: [],
          totalPrice: f.itemPrice * f.qty,
          kitchenStatus: 'SERVED' as const
        }
      ];
      const subtotal = f.itemPrice * f.qty;
      const cgstAmount = Math.round(subtotal * 0.025 * 100) / 100;
      const sgstAmount = cgstAmount;
      OrderRepository.createOrder({
        orderType: f.orderType,
        tableNumber: f.tableNumber,
        items,
        subtotal,
        cgstAmount,
        sgstAmount,
        taxAmount: cgstAmount + sgstAmount,
        totalAmount: Math.round(subtotal + cgstAmount + sgstAmount),
        paymentMethod: f.paymentMethod,
        paymentStatus: 'SUCCESS',
        orderStatus: 'COMPLETED',
        source_type: 'POS'
      });
    });
  });

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
    // no shift is open in this fixture, so there is no terminal to name (it used to print a made-up POS-01)
    expect(report.terminalId).toBe('—');
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

  it('B2-041: an unpaid (KOT-only) order is not counted as settled revenue or collected cash on the official Z-Report', () => {
    const before = EodReportService.generateEodReport();

    OrderRepository.createOrder({
      orderType: 'DINE_IN',
      items: [
        { id: 'oi-eod-unpaid', orderId: '', menuItemId: 'item-eod-unpaid', name: 'Unpaid Dish', sku: 'EOD-UNPAID', quantity: 1, unitPrice: 500, modifiers: [], totalPrice: 500, kitchenStatus: 'PENDING' as const }
      ],
      subtotal: 500,
      cgstAmount: 12.5,
      sgstAmount: 12.5,
      taxAmount: 25,
      totalAmount: 525,
      paymentMethod: 'CASH',
      paymentStatus: 'PENDING',
      orderStatus: 'PREPARING',
      source_type: 'POS'
    });

    const after = EodReportService.generateEodReport();
    expect(after.grossRevenue).toBe(before.grossRevenue);
    expect(after.netRevenue).toBe(before.netRevenue);
    expect(after.ordersSettled).toBe(before.ordersSettled);
    expect(after.paymentSettlement.cash.amount).toBe(before.paymentSettlement.cash.amount);
    expect(after.cashDrawer.cashSales).toBe(before.cashDrawer.cashSales);
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
