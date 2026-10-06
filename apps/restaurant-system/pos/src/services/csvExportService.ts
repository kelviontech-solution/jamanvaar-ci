import { Order } from '@jamanvaar/types';
import { DailyReportSummary, TopItemStat } from '@jamanvaar/business';
import { toCsvRow } from '@jamanvaar/utils';

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

  // B2-061: every row here used to be hand-quoted with `"${x}"`, which never defended against
  // CSV/formula injection (a guest name or dish name starting with `=`/`+`/`-`/`@` fires as a
  // formula the moment this file is opened in Excel/Sheets) and only escaped internal `"` on
  // the one or two fields someone remembered to. toCsvRow does both, on every field, uniformly.
  public static exportOrders(orders: Order[], periodLabel: string = 'Current') {
    const headers = ['Order Number', 'Token Number', 'Date', 'Time', 'Order Type', 'Table', 'Guest Name', 'Phone', 'Items Count', 'Gross Amount', 'Discount', 'CGST', 'SGST', 'Grand Total', 'Payment Method', 'Status'];
    const rows = orders.map((o) => [
      o.orderNumber,
      o.tokenNumber,
      new Date(o.createdAt).toLocaleDateString('en-IN'),
      new Date(o.createdAt).toLocaleTimeString('en-IN'),
      o.orderType,
      o.tableNumber || '-',
      o.customerName || '',
      o.customerPhone || '-',
      o.items.length,
      o.subtotal || o.totalAmount,
      o.discountAmount || 0,
      o.cgstAmount || 0,
      o.sgstAmount || 0,
      o.totalAmount,
      o.paymentMethod,
      o.orderStatus
    ]);

    const csv = [toCsvRow(headers), ...rows.map(toCsvRow)].join('\r\n');
    this.triggerDownload(csv, `JAMANVAAR_Orders_${periodLabel.replace(/\s+/g, '_')}_${Date.now()}.csv`);
  }

  public static exportTopItems(items: TopItemStat[], periodLabel: string = 'Current') {
    const headers = ['Rank', 'Dish Name', 'Category', 'SKU', 'Quantity Sold', 'Average Rate', 'Gross Revenue'];
    const rows = items.map((it, idx) => [idx + 1, it.name, it.categoryName || 'Main Course', it.sku || '', it.quantitySold, it.avgPrice, it.grossRevenue]);

    const csv = [toCsvRow(headers), ...rows.map(toCsvRow)].join('\r\n');
    this.triggerDownload(csv, `JAMANVAAR_Top_Dishes_${periodLabel.replace(/\s+/g, '_')}_${Date.now()}.csv`);
  }

  public static exportFinancialSummary(summary: DailyReportSummary, periodLabel: string = 'Current') {
    const lines = [
      toCsvRow(['JAMANVAAR POS — Financial & Tax Summary']),
      toCsvRow(['Period', periodLabel]),
      toCsvRow(['Generated At', new Date().toLocaleString('en-IN')]),
      '',
      // BUG-LOW-002: was 'Amount (INR)' text — every other currency-labeled
      // CSV/report export in this codebase uses the '₹' glyph (formatINR in
      // @jamanvaar/utils always emits it); standardizing on that here too.
      toCsvRow(['Metric', 'Amount (₹)']),
      toCsvRow(['Gross Food Sales', summary.grossSales]),
      toCsvRow(['Total Discounts', summary.discountAmount]),
      toCsvRow(['CGST', summary.cgstAmount]),
      toCsvRow(['SGST', summary.sgstAmount]),
      toCsvRow(['Total Tax', summary.totalTax]),
      toCsvRow(['Total Collected (incl. GST)', summary.netSales]),
      toCsvRow(['Total Orders Billed', summary.ordersCount]),
      toCsvRow(['Average Order Value', summary.avgOrderValue]),
      '',
      toCsvRow(['Payment Method', 'Collected (₹)']),
      toCsvRow(['Cash at Counter', summary.paymentBreakdown.cash]),
      toCsvRow(['UPI / QR', summary.paymentBreakdown.upi]),
      toCsvRow(['Credit / Debit Card', summary.paymentBreakdown.card]),
      toCsvRow(['Split Payments', summary.paymentBreakdown.split]),
      toCsvRow(['Digital Wallet / Other', summary.paymentBreakdown.wallet + summary.paymentBreakdown.other])
    ];

    this.triggerDownload(lines.join('\r\n'), `JAMANVAAR_Sales_Summary_${periodLabel.replace(/\s+/g, '_')}_${Date.now()}.csv`);
  }
}
