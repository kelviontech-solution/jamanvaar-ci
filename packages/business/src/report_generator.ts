import { GeneratedReport, Order, PaymentMethod } from '@jamanvaar/types';
import { db } from '@jamanvaar/database';
import { escapeCsvField, formatDate, formatINR, formatTime } from '@jamanvaar/utils';
import { CentralReportingService } from './central_reporting_service';

export interface DailyReportSummary {
  dateStr: string;
  grossSales: number;
  discountAmount: number;
  netSales: number;
  cgstAmount: number;
  sgstAmount: number;
  totalTax: number;
  totalCollected: number;
  refundsCount: number;
  refundsAmount: number;
  cancelledCount: number;
  ordersCount: number;
  avgOrderValue: number;
  paymentBreakdown: {
    cash: number;
    upi: number;
    card: number;
    wallet: number;
    split: number;
    other: number;
  };
  orderTypeBreakdown: {
    dineIn: { count: number; total: number };
    takeaway: { count: number; total: number };
    delivery: { count: number; total: number };
    token: { count: number; total: number };
  };
}

export interface DayByDayRow {
  dateKey: string;
  displayDate: string;
  ordersCount: number;
  grossSales: number;
  discount: number;
  tax: number;
  netSales: number;
  cash: number;
  upi: number;
  card: number;
  avgOrderValue: number;
}

export interface TopItemStat {
  id: string;
  name: string;
  sku: string;
  categoryName: string;
  quantitySold: number;
  grossRevenue: number;
  avgPrice: number;
}

export interface CategoryPerformanceStat {
  categoryId: string;
  categoryName: string;
  ordersCount: number;
  itemsSold: number;
  grossRevenue: number;
  revenueSharePercent: number;
}

export interface MonthlySummaryRow {
  monthIndex: number;
  monthName: string;
  ordersCount: number;
  grossSales: number;
  discount: number;
  gst: number;
  netSales: number;
  cash: number;
  upi: number;
  card: number;
  avgOrderValue: number;
}

export class ReportGeneratorService {
  /**
   * Filter completed/valid orders by date range
   */
  public static getFilteredOrders(startDate?: Date, endDate?: Date): Order[] {
    return db.orders.filter((o) => {
      if (o.orderStatus === 'CANCELLED') return false;
      const oDate = new Date(o.createdAt);
      if (startDate && oDate < startDate) return false;
      if (endDate && oDate > endDate) return false;
      return true;
    });
  }

  private static isCash(method: string): boolean {
    return method === 'CASH' || method === 'CASH_AT_COUNTER';
  }

  private static isUpi(method: string): boolean {
    return method === 'UPI' || method === 'UPI_QR';
  }

  private static isCard(method: string): boolean {
    return method === 'CARD' || method === 'CARD_TERMINAL';
  }

  private static isSplit(method: string): boolean {
    return method === 'SPLIT';
  }

  private static isWallet(method: string): boolean {
    return method === 'WALLET' || method === 'NET_BANKING' || method === 'CREDIT';
  }

  /**
   * Calculate summary metrics for arbitrary orders list
   */
  public static calculateSummary(orders: Order[], label: string = 'Report'): DailyReportSummary {
    const central = CentralReportingService.calculateFinancialSummary(orders, label);

    return {
      dateStr: central.dateStr,
      grossSales: central.grossSales,
      discountAmount: central.discountAmount,
      netSales: central.netSales,
      cgstAmount: central.cgstAmount,
      sgstAmount: central.sgstAmount,
      totalTax: central.totalTax,
      totalCollected: central.netCollected,
      refundsCount: central.refundsCount,
      refundsAmount: central.refundsAmount,
      cancelledCount: central.cancelledCount,
      ordersCount: central.ordersCount,
      avgOrderValue: central.avgOrderValue,
      paymentBreakdown: {
        cash: central.paymentBreakdown.cash,
        upi: central.paymentBreakdown.upi,
        card: central.paymentBreakdown.card,
        wallet: 0,
        split: central.paymentBreakdown.split,
        other: central.paymentBreakdown.other
      },
      orderTypeBreakdown: central.orderTypeBreakdown
    };
  }

  /**
   * Daily Sales Report Calculation (Standard Summary)
   */
  public static getDailyReport(targetDate: Date = new Date()): DailyReportSummary {
    const range = CentralReportingService.getBusinessDateRange('TODAY');
    const orders = CentralReportingService.getReportableOrders(db.orders, range);
    return this.calculateSummary(orders, formatDate(targetDate));
  }

  /**
   * Report for configurable time period
   */
  public static getReportForPeriod(
    period: 'TODAY' | 'YESTERDAY' | '7_DAYS' | '30_DAYS' | 'THIS_MONTH' | 'THIS_YEAR' | 'CUSTOM',
    customStart?: Date,
    customEnd?: Date
  ): { summary: DailyReportSummary; orders: Order[]; startDate: Date; endDate: Date } {
    const range = CentralReportingService.getBusinessDateRange(
      period as any,
      customStart,
      customEnd
    );

    const reportableOrders = CentralReportingService.getReportableOrders(db.orders, range);
    const summary = this.calculateSummary(reportableOrders, range.label);

    return {
      summary,
      orders: reportableOrders,
      startDate: range.startDate,
      endDate: range.endDate
    };
  }

  /**
   * Legacy GeneratedReport Builder for Daily Sales
   */
  public static generateDailySalesReport(): GeneratedReport {
    const daily = this.getDailyReport();
    const rows = db.orders.map((o) => ({
      label: `${o.orderNumber} (#${o.tokenNumber})`,
      metric1: o.orderType,
      metric2: formatINR(o.totalAmount),
      metric3: o.paymentMethod,
      metric4: o.orderStatus
    }));

    return {
      id: `rep-${Date.now()}`,
      title: 'Daily Sales & Operations Audit Report',
      reportType: 'DAILY_SALES',
      dateFrom: new Date().toISOString(),
      dateTo: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
      summaryMetrics: {
        totalRevenue: daily.netSales,
        totalOrders: daily.ordersCount,
        avgOrderValue: daily.avgOrderValue,
        totalDiscount: daily.discountAmount,
        totalTax: daily.totalTax
      },
      rows
    };
  }

  /**
   * Legacy GeneratedReport Builder for Item Sales
   */
  public static generateItemSalesReport(): GeneratedReport {
    const topItems = this.getTopSellingItems();
    const rows = topItems.map((it) => ({
      label: it.name,
      metric1: it.sku,
      metric2: `${it.quantitySold} Qty`,
      metric3: formatINR(it.grossRevenue)
    }));

    const totalRevenue = topItems.reduce((s, it) => s + it.grossRevenue, 0);

    return {
      id: `rep-item-${Date.now()}`,
      title: 'Item Sales & Product Popularity Report',
      reportType: 'ITEM_SALES',
      dateFrom: new Date().toISOString(),
      dateTo: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
      summaryMetrics: {
        totalRevenue,
        totalOrders: db.orders.length,
        avgOrderValue: 0,
        totalDiscount: 0,
        totalTax: 0
      },
      rows
    };
  }

  /**
   * Legacy GeneratedReport Builder for Monthly Sales
   */
  public static generateMonthlySalesReport(): GeneratedReport {
    const last30 = this.getLast30DaysReport();
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const rows = db.orders.map((o) => ({
      label: `${formatDate(o.createdAt)} • ${o.orderNumber}`,
      metric1: `Token #${o.tokenNumber} (${o.orderType})`,
      metric2: formatINR(o.totalAmount),
      metric3: `${o.paymentMethod} (GST ₹${o.taxAmount})`,
      metric4: o.paymentStatus
    }));

    return {
      id: `rep-m-${Date.now()}`,
      title: 'Monthly 30-Day Financial & Tax Audit Report',
      reportType: 'DAILY_SALES',
      dateFrom: thirtyDaysAgo.toISOString(),
      dateTo: now.toISOString(),
      generatedAt: now.toISOString(),
      summaryMetrics: {
        totalRevenue: last30.totalSales,
        totalOrders: last30.totalOrders,
        avgOrderValue: last30.avgOrderValue,
        totalDiscount: last30.totalDiscounts,
        totalTax: last30.totalTax
      },
      rows
    };
  }

  /**
   * Day-By-Day Sales Matrix for Date Range with drill-down support
   */
  public static getDayByDayReport(startDate: Date, endDate: Date): DayByDayRow[] {
    const map: Record<string, { date: Date; orders: Order[] }> = {};

    const cur = new Date(startDate);
    cur.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    while (cur <= end) {
      const key = cur.toISOString().split('T')[0];
      map[key] = { date: new Date(cur), orders: [] };
      cur.setDate(cur.getDate() + 1);
    }

    db.orders.forEach((o) => {
      if (o.orderStatus === 'CANCELLED' || o.paymentStatus !== 'SUCCESS') return;
      const oDate = new Date(o.createdAt);
      const key = oDate.toISOString().split('T')[0];
      if (map[key]) {
        map[key].orders.push(o);
      }
    });

    return Object.keys(map)
      .sort((a, b) => b.localeCompare(a))
      .map((key) => {
        const item = map[key];
        const orders = item.orders;
        const grossSales = orders.reduce((s, o) => s + (o.subtotal || o.totalAmount), 0);
        const discount = orders.reduce((s, o) => s + (o.discountAmount || 0), 0);
        const tax = orders.reduce((s, o) => s + (o.taxAmount || 0), 0);
        const netSales = orders.reduce((s, o) => s + o.totalAmount, 0);
        const cash = orders.filter((o) => o.paymentMethod === 'CASH').reduce((s, o) => s + o.totalAmount, 0);
        const upi = orders.filter((o) => o.paymentMethod === 'UPI').reduce((s, o) => s + o.totalAmount, 0);
        const card = orders.filter((o) => o.paymentMethod === 'CARD').reduce((s, o) => s + o.totalAmount, 0);
        const avgOrderValue = orders.length > 0 ? Math.round(netSales / orders.length) : 0;

        return {
          dateKey: key,
          displayDate: formatDate(item.date),
          ordersCount: orders.length,
          grossSales,
          discount,
          tax,
          netSales,
          cash,
          upi,
          card,
          avgOrderValue
        };
      });
  }

  /**
   * Last 30 Days Consolidated Metrics & Trends
   */
  public static getLast30DaysReport(): {
    totalSales: number;
    totalOrders: number;
    avgDailySales: number;
    avgOrderValue: number;
    totalTax: number;
    totalDiscounts: number;
    bestSalesDay: { date: string; sales: number };
    lowestSalesDay: { date: string; sales: number };
    bestSellingItem: string;
    mostUsedPayment: string;
    dailyTrend: DayByDayRow[];
  } {
    const end = new Date();
    const start = new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
    const dailyTrend = this.getDayByDayReport(start, end);

    const totalSales = dailyTrend.reduce((s, r) => s + r.netSales, 0);
    const totalOrders = dailyTrend.reduce((s, r) => s + r.ordersCount, 0);
    const totalTax = dailyTrend.reduce((s, r) => s + r.tax, 0);
    const totalDiscounts = dailyTrend.reduce((s, r) => s + r.discount, 0);
    const avgDailySales = Math.round(totalSales / 30);
    const avgOrderValue = totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0;

    let bestDay = { date: '--', sales: 0 };
    let lowestDay = { date: '--', sales: totalSales > 0 ? Infinity : 0 };

    dailyTrend.forEach((r) => {
      if (r.netSales > bestDay.sales) {
        bestDay = { date: r.displayDate, sales: r.netSales };
      }
      if (r.netSales < lowestDay.sales && r.ordersCount > 0) {
        lowestDay = { date: r.displayDate, sales: r.netSales };
      }
    });

    if (lowestDay.sales === Infinity) lowestDay = { date: '--', sales: 0 };

    const topItems = this.getTopSellingItems(start, end);
    const bestSellingItem = topItems[0]?.name || 'Paneer Tikka';

    const payTotals: Record<string, number> = { CASH: 0, UPI: 0, CARD: 0 };
    dailyTrend.forEach((r) => {
      payTotals.CASH += r.cash;
      payTotals.UPI += r.upi;
      payTotals.CARD += r.card;
    });

    const mostUsedPayment =
      Object.entries(payTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || 'UPI';

    return {
      totalSales,
      totalOrders,
      avgDailySales,
      avgOrderValue,
      totalTax,
      totalDiscounts,
      bestSalesDay: bestDay,
      lowestSalesDay: lowestDay,
      bestSellingItem,
      mostUsedPayment,
      dailyTrend
    };
  }

  /**
   * Yearly Month-by-Month Summary (Jan - Dec)
   */
  public static getYearlyReport(year: number = new Date().getFullYear()): {
    year: number;
    totalSales: number;
    totalOrders: number;
    totalGst: number;
    totalDiscounts: number;
    avgOrderValue: number;
    months: MonthlySummaryRow[];
  } {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const months: MonthlySummaryRow[] = monthNames.map((name, idx) => ({
      monthIndex: idx,
      monthName: name,
      ordersCount: 0,
      grossSales: 0,
      discount: 0,
      gst: 0,
      netSales: 0,
      cash: 0,
      upi: 0,
      card: 0,
      avgOrderValue: 0
    }));

    db.orders.forEach((o) => {
      if (o.orderStatus === 'CANCELLED' || o.paymentStatus !== 'SUCCESS') return;
      const d = new Date(o.createdAt);
      if (d.getFullYear() === year) {
        const mIdx = d.getMonth();
        const m = months[mIdx];
        m.ordersCount++;
        m.grossSales += o.subtotal || o.totalAmount;
        m.discount += o.discountAmount || 0;
        m.gst += o.taxAmount || 0;
        m.netSales += o.totalAmount;
        if (o.paymentMethod === 'CASH') m.cash += o.totalAmount;
        else if (o.paymentMethod === 'UPI') m.upi += o.totalAmount;
        else if (o.paymentMethod === 'CARD') m.card += o.totalAmount;
      }
    });

    months.forEach((m) => {
      m.avgOrderValue = m.ordersCount > 0 ? Math.round(m.netSales / m.ordersCount) : 0;
    });

    const totalSales = months.reduce((s, m) => s + m.netSales, 0);
    const totalOrders = months.reduce((s, m) => s + m.ordersCount, 0);
    const totalGst = months.reduce((s, m) => s + m.gst, 0);
    const totalDiscounts = months.reduce((s, m) => s + m.discount, 0);
    const avgOrderValue = totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0;

    return {
      year,
      totalSales,
      totalOrders,
      totalGst,
      totalDiscounts,
      avgOrderValue,
      months
    };
  }

  /**
   * Top Selling Items Ranked by Quantity & Revenue
   */
  public static getTopSellingItems(startDate?: Date, endDate?: Date): TopItemStat[] {
    const orders = this.getFilteredOrders(startDate, endDate);
    const itemMap: Record<string, { id: string; name: string; sku: string; categoryId: string; qty: number; revenue: number }> = {};

    orders.forEach((o) => {
      o.items.forEach((it) => {
        if (!itemMap[it.menuItemId]) {
          const menuItem = db.menuItems.find((m) => m.id === it.menuItemId);
          itemMap[it.menuItemId] = {
            id: it.menuItemId,
            name: it.name,
            sku: it.sku || menuItem?.sku || 'SKU',
            categoryId: menuItem?.categoryId || 'cat-main',
            qty: 0,
            revenue: 0
          };
        }
        itemMap[it.menuItemId].qty += it.quantity;
        itemMap[it.menuItemId].revenue += it.totalPrice;
      });
    });

    return Object.values(itemMap)
      .map((it) => {
        const cat = db.categories.find((c) => c.id === it.categoryId);
        return {
          id: it.id,
          name: it.name,
          sku: it.sku,
          categoryName: cat?.name || 'Main Course',
          quantitySold: it.qty,
          grossRevenue: it.revenue,
          avgPrice: it.qty > 0 ? Math.round(it.revenue / it.qty) : 0
        };
      })
      .sort((a, b) => b.quantitySold - a.quantitySold);
  }

  /**
   * Category Revenue & Performance Breakdown
   */
  public static getCategoryPerformance(startDate?: Date, endDate?: Date): CategoryPerformanceStat[] {
    const orders = this.getFilteredOrders(startDate, endDate);
    const catMap: Record<string, { name: string; ordersSet: Set<string>; itemsSold: number; revenue: number }> = {};

    db.categories.forEach((c) => {
      catMap[c.id] = { name: c.name, ordersSet: new Set(), itemsSold: 0, revenue: 0 };
    });

    orders.forEach((o) => {
      o.items.forEach((it) => {
        const menuItem = db.menuItems.find((m) => m.id === it.menuItemId);
        const catId = menuItem?.categoryId || 'cat-starters';
        if (!catMap[catId]) {
          catMap[catId] = { name: 'Other', ordersSet: new Set(), itemsSold: 0, revenue: 0 };
        }
        catMap[catId].ordersSet.add(o.id);
        catMap[catId].itemsSold += it.quantity;
        catMap[catId].revenue += it.totalPrice;
      });
    });

    const totalGrossRevenue = Object.values(catMap).reduce((s, c) => s + c.revenue, 0);

    return Object.entries(catMap)
      .map(([id, c]) => ({
        categoryId: id,
        categoryName: c.name,
        ordersCount: c.ordersSet.size,
        itemsSold: c.itemsSold,
        grossRevenue: c.revenue,
        revenueSharePercent: totalGrossRevenue > 0 ? Math.round((c.revenue / totalGrossRevenue) * 100) : 0
      }))
      .sort((a, b) => b.grossRevenue - a.grossRevenue);
  }

  /**
   * Hourly Sales Distribution for Today
   */
  public static getHourlySalesToday(): { hour: string; sales: number; ordersCount: number }[] {
    const today = new Date().toDateString();
    const todayOrders = db.orders.filter(
      (o) => new Date(o.createdAt).toDateString() === today && o.orderStatus !== 'CANCELLED' && o.paymentStatus === 'SUCCESS'
    );

    const hours = [
      '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM',
      '4 PM', '5 PM', '6 PM', '7 PM', '8 PM', '9 PM', '10 PM', '11 PM'
    ];

    const hourMap: Record<number, { sales: number; count: number }> = {};
    for (let h = 9; h <= 23; h++) hourMap[h] = { sales: 0, count: 0 };

    todayOrders.forEach((o) => {
      const h = new Date(o.createdAt).getHours();
      if (hourMap[h]) {
        hourMap[h].sales += o.totalAmount;
        hourMap[h].count += 1;
      }
    });

    return hours.map((lbl, idx) => {
      const hNum = idx + 9;
      return {
        hour: lbl,
        sales: hourMap[hNum]?.sales || 0,
        ordersCount: hourMap[hNum]?.count || 0
      };
    });
  }

  /**
   * Peak Hours Analysis
   */
  public static getPeakHoursAnalysis(): {
    peakHour: string;
    peakSales: number;
    peakOrders: number;
    peakDay: string;
  } {
    const hourly = this.getHourlySalesToday();
    let peak = { hour: '7 PM – 8 PM', sales: 0, orders: 0 };
    hourly.forEach((h) => {
      if (h.sales > peak.sales) {
        peak = { hour: `${h.hour} – ${h.hour === '11 PM' ? '12 AM' : 'Next Hour'}`, sales: h.sales, orders: h.ordersCount };
      }
    });

    const last30 = this.getLast30DaysReport();

    return {
      peakHour: peak.sales > 0 ? peak.hour : '7 PM – 8 PM',
      peakSales: peak.sales,
      peakOrders: peak.orders,
      peakDay: last30.bestSalesDay.date
    };
  }

  /**
   * End of Day (EOD) Settlement Summary Report
   */
  public static getEodSummary(): {
    restaurantName: string;
    date: string;
    generatedAt: string;
    daily: DailyReportSummary;
    activeShift: any;
    topDishes: TopItemStat[];
  } {
    const daily = this.getDailyReport(new Date());
    const topDishes = this.getTopSellingItems().slice(0, 5);
    const activeShift = db.shifts[0] || null;

    return {
      restaurantName: db.restaurant.name || '',
      date: formatDate(new Date()),
      generatedAt: `${formatDate(new Date())} ${formatTime(new Date())}`,
      daily,
      activeShift,
      topDishes
    };
  }

  /**
   * Clear Daily Transactions (Preserves Menu & Settings)
   */
  public static clearDailyOrders(): { clearedCount: number } {
    const todayStr = new Date().toDateString();
    const beforeCount = db.orders.length;
    db.orders = db.orders.filter((o) => new Date(o.createdAt).toDateString() !== todayStr);
    db.receiptRecords = db.receiptRecords.filter((r) => new Date(r.createdAt).toDateString() !== todayStr);
    db.printJobs = [];
    db.notify();
    return { clearedCount: beforeCount - db.orders.length };
  }

  /**
   * Archive Monthly Data to JSON string, then reset ledger
   */
  public static archiveAndResetMonthlyData(): { archiveJson: string; archivedOrdersCount: number } {
    const archiveData = {
      restaurant: db.restaurant,
      outlet: db.outlet,
      archivedAt: new Date().toISOString(),
      orders: [...db.orders],
      receipts: [...db.receiptRecords],
      auditLogs: [...db.auditLogs]
    };

    const archivedOrdersCount = db.orders.length;
    const archiveJson = JSON.stringify(archiveData, null, 2);

    db.orders = [];
    db.receiptRecords = [];
    db.printJobs = [];
    db.notify();

    return { archiveJson, archivedOrdersCount };
  }

  /**
   * Export detailed transaction ledger to CSV
   */
  public static exportTransactionsCsv(orders: Order[] = db.orders): string {
    const headers = [
      'Invoice / Order Number',
      'Token Number',
      'Date',
      'Time',
      'Order Type',
      'Table Number',
      'Customer Phone',
      'Customer Name',
      'Items Count',
      'Subtotal',
      'Discount',
      'CGST (2.5%)',
      'SGST (2.5%)',
      'Total GST',
      'Total Amount',
      'Payment Method',
      'Payment Status',
      'Order Status'
    ];

    const lines = [
      `"JAMANVAAR RESTAURANT — DETAILED TRANSACTIONS REPORT"`,
      `"Generated At: ${formatDate(new Date())} ${formatTime(new Date())}"`,
      `"Total Records: ${orders.length}"`,
      '',
      headers.join(',')
    ];

    orders.forEach((o) => {
      const d = new Date(o.createdAt);
      lines.push([
        escapeCsvField(o.orderNumber || ''),
        escapeCsvField(o.tokenNumber || ''),
        escapeCsvField(formatDate(d)),
        escapeCsvField(formatTime(d)),
        escapeCsvField(o.orderType || ''),
        escapeCsvField(o.tableNumber || '-'),
        escapeCsvField(o.customerPhone || ''),
        escapeCsvField(o.customerName || ''),
        escapeCsvField(o.items?.length || 0),
        escapeCsvField(o.subtotal || 0),
        escapeCsvField(o.discountAmount || 0),
        escapeCsvField(o.cgstAmount || 0),
        escapeCsvField(o.sgstAmount || 0),
        escapeCsvField(o.taxAmount || 0),
        escapeCsvField(o.totalAmount || 0),
        escapeCsvField(o.paymentMethod || ''),
        escapeCsvField(o.paymentStatus || ''),
        escapeCsvField(o.orderStatus || '')
      ].join(','));
    });

    return lines.join('\n');
  }

  /**
   * Export structured data to standard CSV
   */
  public static exportToCsv(report: GeneratedReport): string {
    const headers = ['Label', 'Attribute / Type', 'Amount / Value', 'Method / Info', 'Status'];
    const lines = [
      `"JAMANVAAR RESTAURANT — ${report.title.toUpperCase()}"`,
      `"Generated At: ${formatDate(report.generatedAt)} ${formatTime(report.generatedAt)}"`,
      `"Total Gross Revenue: ${report.summaryMetrics.totalRevenue}"`,
      `"Total Completed Orders: ${report.summaryMetrics.totalOrders}"`,
      '',
      headers.join(',')
    ];

    report.rows.forEach((r) => {
      lines.push(
        [r.label, r.metric1, r.metric2 || '', r.metric3 || '', r.metric4 || '']
          .map(escapeCsvField)
          .join(',')
      );
    });

    return lines.join('\n');
  }
}
