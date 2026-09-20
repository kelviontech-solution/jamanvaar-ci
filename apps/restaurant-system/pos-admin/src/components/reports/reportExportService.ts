import { Order } from '@jamanvaar/types';
import { formatDate, formatTime, formatINR } from '@jamanvaar/utils';
import { db } from '@jamanvaar/database';
import {
  ReportSummaryMetrics,
  DayRow,
  DishPerformanceRow,
  CategoryPerformanceRow,
  TablePerformanceRow,
  StaffPerformanceRow,
  StationPerformanceRow,
  GstTaxBreakdownRow,
  EodReconciliationData,
  ReportDateRange,
  ReportDesignTheme
} from './reportDataEngine';

export class ReportExportService {
  /**
   * Export detailed raw transaction list to CSV
   */
  public static exportTransactionsCsv(orders: Order[], title = 'Sales Transactions'): void {
    const headers = [
      'Order #',
      'Token #',
      'Date',
      'Time',
      'Order Type',
      'Table #',
      'Customer Name',
      'Customer Phone',
      'Items Count',
      'Subtotal (₹)',
      'Discount (₹)',
      'CGST (₹)',
      'SGST (₹)',
      'Total Amount (₹)',
      'Payment Method',
      'Payment Status',
      'Captain / Cashier'
    ];

    const rows = orders.map((o) => [
      `"${o.orderNumber || ''}"`,
      `"${o.tokenNumber || ''}"`,
      `"${formatDate(new Date(o.createdAt))}"`,
      `"${formatTime(new Date(o.createdAt))}"`,
      `"${o.orderType || ''}"`,
      `"${o.tableNumber || '-'}"`,
      `"${(o.customerName || '').replace(/"/g, '""')}"`,
      `"${o.customerPhone || ''}"`,
      `"${o.items?.length || 0}"`,
      `"${o.subtotal || 0}"`,
      `"${o.discountAmount || 0}"`,
      `"${o.cgstAmount || 0}"`,
      `"${o.sgstAmount || 0}"`,
      `"${o.totalAmount || 0}"`,
      `"${o.paymentMethod || ''}"`,
      `"${o.paymentStatus || ''}"`,
      `"${(o.captainName || o.cashierName || 'Cashier').replace(/"/g, '""')}"`
    ]);

    const csvContent = [
      `"JAMANVAAR RESTAURANT — ${title.toUpperCase()}"`,
      `"Generated At: ${formatDate(new Date())} ${formatTime(new Date())}"`,
      `"Total Orders: ${orders.length}"`,
      '',
      headers.join(','),
      ...rows.map((r) => r.join(','))
    ].join('\n');

    this.downloadFile(csvContent, `jamanvaar_${title.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
  }

  /**
   * Export Day-by-Day Matrix to CSV
   */
  public static exportDayByDayCsv(days: DayRow[]): void {
    const headers = ['Date', 'Orders Count', 'Gross Sales (₹)', 'Discounts (₹)', 'GST Tax (₹)', 'Total Billed incl. GST (₹)', 'Cash (₹)', 'UPI (₹)', 'Card (₹)', 'AOV (₹)'];
    const rows = days.map((d) => [
      `"${d.displayDate}"`,
      `"${d.ordersCount}"`,
      `"${d.grossSales}"`,
      `"${d.discount}"`,
      `"${d.tax}"`,
      `"${d.netSales}"`,
      `"${d.cash}"`,
      `"${d.upi}"`,
      `"${d.card}"`,
      `"${d.avgOrderValue}"`
    ]);

    const csv = [
      `"JAMANVAAR — DAY-BY-DAY AUDIT MATRIX"`,
      `"Generated At: ${formatDate(new Date())}"`,
      '',
      headers.join(','),
      ...rows.map((r) => r.join(','))
    ].join('\n');

    this.downloadFile(csv, `jamanvaar_day_by_day_ledger_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
  }

  /**
   * Export Top Selling Dishes to CSV
   */
  public static exportDishesCsv(dishes: DishPerformanceRow[]): void {
    const headers = ['Rank', 'Dish Name', 'SKU', 'Category', 'Quantity Sold', 'Gross Revenue (₹)', 'Avg Selling Price (₹)', 'Revenue Share %', 'Est. Food Cost (₹)', 'Gross Margin %'];
    const rows = dishes.map((d, idx) => [
      `"#${idx + 1}"`,
      `"${d.name.replace(/"/g, '""')}"`,
      `"${d.sku}"`,
      `"${d.categoryName}"`,
      `"${d.quantitySold}"`,
      `"${d.grossRevenue}"`,
      `"${d.avgSellingPrice}"`,
      `"${d.revenueSharePercent}%"`,
      `"${d.foodCostEstimate}"`,
      `"${d.grossMarginPercent}%"`
    ]);

    const csv = [
      `"JAMANVAAR — PRODUCT & MENU PERFORMANCE REPORT"`,
      `"Generated At: ${formatDate(new Date())}"`,
      '',
      headers.join(','),
      ...rows.map((r) => r.join(','))
    ].join('\n');

    this.downloadFile(csv, `jamanvaar_dish_performance_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
  }

  /**
   * Export GST Tax Report to CSV
   */
  public static exportGstCsv(gstRows: GstTaxBreakdownRow[]): void {
    const headers = ['Tax Rate %', 'Invoices Count', 'Taxable Amount (₹)', 'CGST (2.5%) (₹)', 'SGST (2.5%) (₹)', 'Total GST (5%) (₹)'];
    const rows = gstRows.map((g) => [
      `"${g.taxRatePercent}%"`,
      `"${g.invoicesCount}"`,
      `"${g.taxableAmount}"`,
      `"${g.cgstAmount}"`,
      `"${g.sgstAmount}"`,
      `"${g.totalTax}"`
    ]);

    const csv = [
      `"JAMANVAAR — GST TAX FILING & AUDIT REPORT"`,
      `"Generated At: ${formatDate(new Date())}"`,
      `"GSTIN: ${db.restaurant.gstin || 'not registered'}"`,
      '',
      headers.join(','),
      ...rows.map((r) => r.join(','))
    ].join('\n');

    this.downloadFile(csv, `jamanvaar_gst_audit_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
  }

  /**
   * Export to Clean Excel Format (.xls format with XML spreadsheet)
   */
  public static exportExcelXml(title: string, headers: string[], rows: (string | number)[][]): void {
    let xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#0B253A" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="Title">
   <Font ss:Bold="1" ss:Size="14" ss:Color="#E66817"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Report">
  <Table>
   <Row><Cell ss:StyleID="Title"><Data ss:Type="String">JAMANVAAR RESTAURANT — ${title}</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">Generated: ${formatDate(new Date())} ${formatTime(new Date())}</Data></Cell></Row>
   <Row></Row>
   <Row ss:StyleID="Header">
    ${headers.map((h) => `<Cell><Data ss:Type="String">${h}</Data></Cell>`).join('')}
   </Row>
   ${rows
     .map(
       (r) =>
         `<Row>${r
           .map((cell) => {
             const isNum = typeof cell === 'number';
             return `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${cell}</Data></Cell>`;
           })
           .join('')}</Row>`
     )
     .join('\n   ')}
  </Table>
 </Worksheet>
</Workbook>`;

    this.downloadFile(xml, `jamanvaar_${title.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.xls`, 'application/vnd.ms-excel');
  }

  /**
   * Helper: Trigger browser file download
   */
  private static downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
