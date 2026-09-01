import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository, PrintQueueRepository } from '@jamanvaar/database';
import { ReportGeneratorService } from '@jamanvaar/business';
import { PdfReportBuilder, ReportFullData } from '../apps/restaurant-system/pos/src/services/pdfReportBuilder';
import { CsvExportService } from '../apps/restaurant-system/pos/src/services/csvExportService';
import { PosPrinterService } from '../apps/restaurant-system/pos/src/services/printerService';
import { Order } from '@jamanvaar/types';

describe('JAMANVAAR POS — Reports & Professional PDF Export Suite', () => {
  beforeEach(() => {
    db.orders = [];
    db.printJobs = [];
  });

  const seedSampleOrders = () => {
    // 1. Order Dine-In Cash
    OrderRepository.createOrder({
      orderType: 'DINE_IN',
      tableNumber: 'T-01',
      items: [
        {
          id: 'oi-1',
          orderId: '',
          menuItemId: 'dish-paneer-tikka',
          name: 'Paneer Tikka Masala',
          sku: 'PTM-01',
          modifiers: [],
          quantity: 2,
          unitPrice: 280,
          totalPrice: 560,
          kitchenStatus: 'SERVED'
        }
      ],
      subtotal: 560,
      discountAmount: 0,
      cgstAmount: 14,
      sgstAmount: 14,
      taxAmount: 28,
      totalAmount: 588,
      paymentMethod: 'CASH',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED',
      source_type: 'POS'
    });

    // 2. Order Takeaway UPI
    OrderRepository.createOrder({
      orderType: 'TAKEAWAY',
      items: [
        {
          id: 'oi-2',
          orderId: '',
          menuItemId: 'dish-dal-makhani',
          name: 'Dal Makhani',
          sku: 'DM-01',
          modifiers: [],
          quantity: 1,
          unitPrice: 220,
          totalPrice: 220,
          kitchenStatus: 'SERVED'
        },
        {
          id: 'oi-3',
          orderId: '',
          menuItemId: 'dish-butter-naan',
          name: 'Butter Naan',
          sku: 'BN-01',
          modifiers: [],
          quantity: 3,
          unitPrice: 40,
          totalPrice: 120,
          kitchenStatus: 'SERVED'
        }
      ],
      subtotal: 340,
      discountAmount: 40,
      cgstAmount: 7.5,
      sgstAmount: 7.5,
      taxAmount: 15,
      totalAmount: 315,
      paymentMethod: 'UPI',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED',
      source_type: 'POS'
    });
  };

  it('1. should calculate daily sales report with accurate revenue, GST, and tender breakdown', () => {
    seedSampleOrders();

    const { summary, orders } = ReportGeneratorService.getReportForPeriod('TODAY');
    expect(orders.length).toBe(2);
    expect(summary.ordersCount).toBe(2);
    expect(summary.grossSales).toBe(900); // 560 + 340
    expect(summary.discountAmount).toBe(40);
    expect(summary.totalTax).toBe(43); // 28 + 15
    expect(summary.netSales).toBe(903); // 588 + 315

    // Payment reconciliation
    expect(summary.paymentBreakdown.cash).toBe(588);
    expect(summary.paymentBreakdown.upi).toBe(315);
    expect(summary.paymentBreakdown.card).toBe(0);
    expect(summary.totalCollected).toBe(903);
  });

  it('2. should accurately rank top selling dishes by quantity and gross revenue', () => {
    seedSampleOrders();

    const topDishes = ReportGeneratorService.getTopSellingItems();
    expect(topDishes.length).toBeGreaterThanOrEqual(3);

    // Butter Naan had qty 3
    const naan = topDishes.find((d) => d.name === 'Butter Naan');
    expect(naan).toBeDefined();
    expect(naan?.quantitySold).toBe(3);
    expect(naan?.grossRevenue).toBe(120);

    // Paneer Tikka had qty 2 and revenue 560
    const paneer = topDishes.find((d) => d.name === 'Paneer Tikka Masala');
    expect(paneer).toBeDefined();
    expect(paneer?.quantitySold).toBe(2);
    expect(paneer?.grossRevenue).toBe(560);
  });

  it('3. should generate valid PDF 1.4 vector byte stream across all 5 design templates', () => {
    seedSampleOrders();

    const { summary } = ReportGeneratorService.getReportForPeriod('TODAY');
    const topItems = ReportGeneratorService.getTopSellingItems();

    const reportData: ReportFullData = {
      title: 'POS Daily Sales Report',
      periodLabel: 'Today (31 Aug 2026)',
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
      generatedAt: new Date().toLocaleString('en-IN'),
      generatedBy: 'Cashier Om',
      summary,
      topItems,
      cashiers: [{ name: 'Cashier Desk', ordersCount: 2, netSales: 903, cash: 588, upi: 315, card: 0 }]
    };

    const designs: Array<'CLASSIC' | 'MODERN' | 'COMPACT' | 'STATEMENT' | 'BRANDED'> = [
      'CLASSIC',
      'MODERN',
      'COMPACT',
      'STATEMENT',
      'BRANDED'
    ];

    designs.forEach((design) => {
      const pdfBytes = PdfReportBuilder.generatePdf(reportData, design);
      expect(pdfBytes).toBeDefined();
      expect(pdfBytes.length).toBeGreaterThan(500);

      const pdfText = new TextDecoder().decode(pdfBytes);
      expect(pdfText.startsWith('%PDF-1.4')).toBe(true);
      expect(pdfText).toContain('%%EOF');
      expect(pdfText).toContain('JAMANVAAR');
      expect(pdfText).toContain('Rs. 903');
    });
  });

  it('4. should handle empty reports gracefully without blank errors', () => {
    // 0 orders in database
    const { summary, orders } = ReportGeneratorService.getReportForPeriod('TODAY');
    expect(orders.length).toBe(0);
    expect(summary.ordersCount).toBe(0);
    expect(summary.netSales).toBe(0);

    const reportData: ReportFullData = {
      title: 'POS Daily Sales Report',
      periodLabel: 'Today (Empty)',
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
      generatedAt: new Date().toLocaleString('en-IN'),
      generatedBy: 'Cashier Om',
      summary,
      topItems: [],
      cashiers: []
    };

    const pdfBytes = PdfReportBuilder.generatePdf(reportData, 'CLASSIC');
    expect(pdfBytes).toBeDefined();
    const pdfText = new TextDecoder().decode(pdfBytes);
    expect(pdfText.startsWith('%PDF-1.4')).toBe(true);
    expect(pdfText).toContain('No dish sales recorded');
  });

  it('5. should dispatch report print jobs directly to the configured report printer in print queue', () => {
    seedSampleOrders();

    const printer = PosPrinterService.getPrinterForRole('REPORT');
    expect(printer).toBeDefined();

    const job = PrintQueueRepository.addJob({
      type: 'SHIFT_REPORT',
      printerId: printer.id,
      printerName: printer.name,
      rawPayload: '--- JAMANVAAR REPORT TICKET ---',
      paperSize: '80mm'
    });

    expect(job).toBeDefined();
    expect(job.type).toBe('SHIFT_REPORT');
    expect(db.printJobs.length).toBe(1);
    expect(db.printJobs[0].printerName).toContain(printer.name);
  });
});
