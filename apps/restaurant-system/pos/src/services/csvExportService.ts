import { Order } from '@jamanvaar/types';
import { DailyReportSummary, TopItemStat } from '@jamanvaar/business';

export class CsvExportService {
  private static triggerDownload(csvContent: string, filename: string) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 200);
  }

  public static exportOrders(orders: Order[], periodLabel: string = 'Current') {
    const headers = ['Order Number', 'Token Number', 'Date', 'Time', 'Order Type', 'Table', 'Guest Name', 'Phone', 'Items Count', 'Gross Amount', 'Discount', 'CGST', 'SGST', 'Grand Total', 'Payment Method', 'Status'];
    const rows = orders.map((o) => [
      `"${o.orderNumber}"`,
      `"${o.tokenNumber}"`,
      `"${new Date(o.createdAt).toLocaleDateString('en-IN')}"`,
      `"${new Date(o.createdAt).toLocaleTimeString('en-IN')}"`,
      `"${o.orderType}"`,
      `"${o.tableNumber || '-'}"`,
      `"${(o.customerName || '').replace(/"/g, '""')}"`,
      `"${o.customerPhone || '-'}"`,
      o.items.length,
      o.subtotal || o.totalAmount,
      o.discountAmount || 0,
      o.cgstAmount || 0,
      o.sgstAmount || 0,
      o.totalAmount,
      `"${o.paymentMethod}"`,
      `"${o.orderStatus}"`
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    this.triggerDownload(csv, `JAMANVAAR_Orders_${periodLabel.replace(/\s+/g, '_')}_${Date.now()}.csv`);
  }

  public static exportTopItems(items: TopItemStat[], periodLabel: string = 'Current') {
    const headers = ['Rank', 'Dish Name', 'Category', 'SKU', 'Quantity Sold', 'Average Rate', 'Gross Revenue'];
    const rows = items.map((it, idx) => [
      idx + 1,
      `"${it.name.replace(/"/g, '""')}"`,
      `"${it.categoryName || 'Main Course'}"`,
      `"${it.sku || ''}"`,
      it.quantitySold,
      it.avgPrice,
      it.grossRevenue
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    this.triggerDownload(csv, `JAMANVAAR_Top_Dishes_${periodLabel.replace(/\s+/g, '_')}_${Date.now()}.csv`);
  }

  public static exportFinancialSummary(summary: DailyReportSummary, periodLabel: string = 'Current') {
    const lines = [
      `"JAMANVAAR POS — Financial & Tax Summary"`,
      `"Period","${periodLabel}"`,
      `"Generated At","${new Date().toLocaleString('en-IN')}"`,
      '',
      `"Metric","Amount (INR)"`,
      `"Gross Food Sales",${summary.grossSales}`,
      `"Total Discounts",${summary.discountAmount}`,
      `"CGST (2.5%)",${summary.cgstAmount}`,
      `"SGST (2.5%)",${summary.sgstAmount}`,
      `"Total Tax",${summary.totalTax}`,
      `"Net Collected Revenue",${summary.netSales}`,
      `"Total Orders Billed",${summary.ordersCount}`,
      `"Average Order Value",${summary.avgOrderValue}`,
      '',
      `"Payment Method","Collected (INR)"`,
      `"Cash at Counter",${summary.paymentBreakdown.cash}`,
      `"UPI / QR",${summary.paymentBreakdown.upi}`,
      `"Credit / Debit Card",${summary.paymentBreakdown.card}`,
      `"Split Payments",${summary.paymentBreakdown.split}`,
      `"Digital Wallet / Other",${summary.paymentBreakdown.wallet + summary.paymentBreakdown.other}`
    ];

    this.triggerDownload(lines.join('\n'), `JAMANVAAR_Sales_Summary_${periodLabel.replace(/\s+/g, '_')}_${Date.now()}.csv`);
  }
}
