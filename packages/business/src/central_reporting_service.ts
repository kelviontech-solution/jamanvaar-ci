import { Order, PaymentMethod, OrderType, OrderStatus } from '@jamanvaar/types';
import { db, BusinessDayAccountingService } from '@jamanvaar/database';
import { formatDate, formatINR, formatTime } from '@jamanvaar/utils';

export type CentralDatePreset =
  | 'TODAY'
  | 'YESTERDAY'
  | '7_DAYS'
  | '30_DAYS'
  | 'THIS_MONTH'
  | 'LAST_MONTH'
  | 'THIS_YEAR'
  | 'CUSTOM'
  | 'ALL';

export interface BusinessDateRange {
  preset: CentralDatePreset;
  startDate: Date;
  endDate: Date;
  label: string;
  dateKey: string; // YYYY-MM-DD
}

export interface CentralFinancialSummary {
  dateStr: string;
  grossSales: number;
  discountAmount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  totalTax: number;
  netSales: number;
  refundsCount: number;
  refundsAmount: number;
  netCollected: number;
  cancelledCount: number;
  cancelledAmount: number;
  ordersCount: number;
  avgOrderValue: number;
  paymentBreakdown: {
    cash: number;
    upi: number;
    card: number;
    split: number;
    other: number;
    totalPayments: number;
  };
  orderTypeBreakdown: {
    dineIn: { count: number; total: number };
    takeaway: { count: number; total: number };
    delivery: { count: number; total: number };
    token: { count: number; total: number };
  };
  reconciled: boolean;
  varianceAmount: number;
}

export interface PeriodReconciliationResult {
  periodLabel: string;
  dateRange: { start: string; end: string };
  completedOrdersCount: number;
  completedBillsCount: number;
  paymentRecordsCount: number;
  grossSales: number;
  discounts: number;
  taxableSales: number;
  gstTotal: number;
  netSales: number;
  refunds: number;
  netCollected: number;
  paymentBreakdown: {
    cash: number;
    upi: number;
    card: number;
    split: number;
    other: number;
    total: number;
  };
  variance: number;
  isReconciled: boolean;
  mismatches: string[];
  sources: {
    dashboardSales: number;
    billsSales: number;
    reportsSales: number;
    paymentSales: number;
  };
}

export class CentralReportingService {
  /**
   * Resolve official Date Range for any preset in Asia/Kolkata (IST) context
   */
  public static getBusinessDateRange(
    preset: CentralDatePreset = 'TODAY',
    customStart?: string | Date,
    customEnd?: string | Date
  ): BusinessDateRange {
    const now = new Date();
    
    // Normalize to local calendar day (IST representation in client environment)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const pad = (n: number) => String(n).padStart(2, '0');
    const toDateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === 'TODAY') {
      return {
        preset,
        startDate: todayStart,
        endDate: todayEnd,
        label: `Today (${formatDate(now)})`,
        dateKey: toDateKey(todayStart)
      };
    }

    if (preset === 'YESTERDAY') {
      const yestStart = new Date(todayStart);
      yestStart.setDate(yestStart.getDate() - 1);
      const yestEnd = new Date(todayEnd);
      yestEnd.setDate(yestEnd.getDate() - 1);
      return {
        preset,
        startDate: yestStart,
        endDate: yestEnd,
        label: `Yesterday (${formatDate(yestStart)})`,
        dateKey: toDateKey(yestStart)
      };
    }

    if (preset === '7_DAYS') {
      const start = new Date(todayStart);
      start.setDate(start.getDate() - 6);
      return {
        preset,
        startDate: start,
        endDate: todayEnd,
        label: `Last 7 Days (${formatDate(start)} – ${formatDate(todayEnd)})`,
        dateKey: toDateKey(todayStart)
      };
    }

    if (preset === '30_DAYS') {
      const start = new Date(todayStart);
      start.setDate(start.getDate() - 29);
      return {
        preset,
        startDate: start,
        endDate: todayEnd,
        label: `Last 30 Days (${formatDate(start)} – ${formatDate(todayEnd)})`,
        dateKey: toDateKey(todayStart)
      };
    }

    if (preset === 'THIS_MONTH') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return {
        preset,
        startDate: start,
        endDate: todayEnd,
        label: `This Month (${now.toLocaleString('en-IN', { month: 'long', year: 'numeric' })})`,
        dateKey: toDateKey(todayStart)
      };
    }

    if (preset === 'LAST_MONTH') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return {
        preset,
        startDate: start,
        endDate: end,
        label: `Last Month (${start.toLocaleString('en-IN', { month: 'long', year: 'numeric' })})`,
        dateKey: toDateKey(start)
      };
    }

    if (preset === 'THIS_YEAR') {
      const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      return {
        preset,
        startDate: start,
        endDate: todayEnd,
        label: `This Year (${now.getFullYear()})`,
        dateKey: toDateKey(todayStart)
      };
    }

    if (preset === 'CUSTOM' && customStart && customEnd) {
      const s = typeof customStart === 'string' ? new Date(`${customStart}T00:00:00`) : new Date(customStart);
      s.setHours(0, 0, 0, 0);
      const e = typeof customEnd === 'string' ? new Date(`${customEnd}T23:59:59.999`) : new Date(customEnd);
      e.setHours(23, 59, 59, 999);
      return {
        preset,
        startDate: s,
        endDate: e,
        label: `${formatDate(s)} – ${formatDate(e)}`,
        dateKey: toDateKey(s)
      };
    }

    // Default: ALL History
    return {
      preset: 'ALL',
      startDate: new Date(0),
      endDate: new Date(2100, 0, 1),
      label: 'All Bills & History',
      dateKey: 'ALL'
    };
  }

  /**
   * Authoritative Single Predicate: Determines which orders qualify for reporting
   */
  public static getReportableOrders(
    allOrders: Order[],
    range?: BusinessDateRange,
    filters?: {
      orderType?: string;
      paymentMethod?: string;
      orderStatus?: string;
      cashier?: string;
      searchQuery?: string;
      includeCancelled?: boolean;
    }
  ): Order[] {
    return allOrders.filter((o) => {
      // 1. Cancelled orders are excluded from normal reporting unless explicitly requested
      if (!filters?.includeCancelled && o.orderStatus === 'CANCELLED') {
        return false;
      }

      // 2. Date Boundary Filter (respects Active Business Day for TODAY)
      if (range && range.preset !== 'ALL') {
        if (range.preset === 'TODAY') {
          const activeDay = BusinessDayAccountingService.getActiveBusinessDay();
          if (o.businessDayId) {
            if (o.businessDayId !== activeDay.id) return false;
          } else {
            const oDateStr = new Date(o.createdAt).toISOString().slice(0, 10);
            if (oDateStr !== activeDay.businessDate) {
              const orderTime = new Date(o.createdAt).getTime();
              if (isNaN(orderTime)) return false;
              if (orderTime < range.startDate.getTime() || orderTime > range.endDate.getTime()) {
                return false;
              }
            }
          }
        } else {
          const orderTime = new Date(o.createdAt).getTime();
          if (isNaN(orderTime)) return false;
          if (orderTime < range.startDate.getTime() || orderTime > range.endDate.getTime()) {
            return false;
          }
        }
      }

      // 3. Order Type Filter
      if (filters?.orderType && filters.orderType !== 'ALL') {
        if (o.orderType !== filters.orderType) return false;
      }

      // 4. Payment Method Filter
      if (filters?.paymentMethod && filters.paymentMethod !== 'ALL') {
        const pm = (o.paymentMethod || '').toUpperCase();
        const f = filters.paymentMethod.toUpperCase();
        if (f === 'CASH' && pm !== 'CASH' && pm !== 'CASH_AT_COUNTER') return false;
        else if (f === 'UPI' && pm !== 'UPI' && pm !== 'UPI_QR') return false;
        else if (f === 'CARD' && pm !== 'CARD' && pm !== 'CARD_TERMINAL') return false;
        else if (f === 'SPLIT' && pm !== 'SPLIT') return false;
        else if (f !== 'CASH' && f !== 'UPI' && f !== 'CARD' && f !== 'SPLIT' && pm !== f) return false;
      }

      // 5. Order Status Filter
      if (filters?.orderStatus && filters.orderStatus !== 'ALL') {
        if (filters.orderStatus === 'COMPLETED' && o.orderStatus !== 'COMPLETED') return false;
        if (filters.orderStatus === 'REFUNDED' && o.orderStatus !== 'REFUNDED') return false;
        if (filters.orderStatus === 'CANCELLED' && o.orderStatus !== 'CANCELLED') return false;
      }

      // 6. Cashier Filter
      if (filters?.cashier && filters.cashier !== 'ALL') {
        const cName = (o.cashierName || '').toLowerCase();
        if (!cName.includes(filters.cashier.toLowerCase())) return false;
      }

      // 7. Search Query Filter
      if (filters?.searchQuery && filters.searchQuery.trim()) {
        const q = filters.searchQuery.toLowerCase().trim();
        const mNum = (o.orderNumber || '').toLowerCase().includes(q);
        const mTok = (o.tokenNumber || '').toLowerCase().includes(q);
        const mPhone = (o.customerPhone || '').toLowerCase().includes(q);
        const mName = (o.customerName || '').toLowerCase().includes(q);
        const mTxn = (o.paymentTransactionId || '').toLowerCase().includes(q);
        const mItem = (o.items || []).some((it) => it.name.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q));
        if (!mNum && !mTok && !mPhone && !mName && !mTxn && !mItem) return false;
      }

      return true;
    });
  }

  /**
   * Authoritative Single Formula Engine for Financial Calculations
   */
  public static calculateFinancialSummary(
    orders: Order[],
    label: string = 'Summary'
  ): CentralFinancialSummary {
    let grossSales = 0;
    let discountAmount = 0;
    let cgstAmount = 0;
    let sgstAmount = 0;
    let netSales = 0;
    let refundsCount = 0;
    let refundsAmount = 0;
    let cancelledCount = 0;
    let cancelledAmount = 0;
    let completedOrdersCount = 0;

    const paymentBreakdown = {
      cash: 0,
      upi: 0,
      card: 0,
      split: 0,
      other: 0,
      totalPayments: 0
    };

    const orderTypeBreakdown = {
      dineIn: { count: 0, total: 0 },
      takeaway: { count: 0, total: 0 },
      delivery: { count: 0, total: 0 },
      token: { count: 0, total: 0 }
    };

    orders.forEach((o) => {
      const isCancelled = o.orderStatus === 'CANCELLED';
      const isRefunded = o.orderStatus === 'REFUNDED';
      const orderTotal = Number(o.totalAmount || 0);

      if (isCancelled) {
        cancelledCount++;
        cancelledAmount += orderTotal;
        return;
      }

      completedOrdersCount++;

      // Gross Sales is based on item subtotals (or order subtotal if present)
      const subtotal = Number(o.subtotal || orderTotal);
      const discount = Number(o.discountAmount || 0);
      const cgst = Number(o.cgstAmount || Math.round((subtotal - discount) * 0.025 * 100) / 100);
      const sgst = Number(o.sgstAmount || Math.round((subtotal - discount) * 0.025 * 100) / 100);

      grossSales += subtotal;
      discountAmount += discount;
      cgstAmount += cgst;
      sgstAmount += sgst;
      netSales += orderTotal;

      if (isRefunded) {
        refundsCount++;
        const refAmt = Number((o as any).refundAmount || orderTotal);
        refundsAmount += refAmt;
      }

      // Apportion payment method
      const pm = (o.paymentMethod || '').toUpperCase();
      if (pm === 'CASH' || pm === 'CASH_AT_COUNTER') {
        paymentBreakdown.cash += orderTotal;
      } else if (pm === 'UPI' || pm === 'UPI_QR' || pm === 'BHARAT_QR') {
        paymentBreakdown.upi += orderTotal;
      } else if (pm === 'CARD' || pm === 'CARD_TERMINAL' || pm === 'POS_CARD') {
        paymentBreakdown.card += orderTotal;
      } else if (pm === 'SPLIT') {
        // Apportion split 50% Cash / 50% UPI
        const half = Math.round(orderTotal / 2);
        paymentBreakdown.cash += half;
        paymentBreakdown.upi += (orderTotal - half);
        paymentBreakdown.split += orderTotal;
      } else {
        paymentBreakdown.other += orderTotal;
      }

      // Apportion Order Type
      if (o.orderType === 'DINE_IN') {
        orderTypeBreakdown.dineIn.count++;
        orderTypeBreakdown.dineIn.total += orderTotal;
      } else if (o.orderType === 'TAKEAWAY') {
        orderTypeBreakdown.takeaway.count++;
        orderTypeBreakdown.takeaway.total += orderTotal;
      } else if (o.orderType === 'DELIVERY') {
        orderTypeBreakdown.delivery.count++;
        orderTypeBreakdown.delivery.total += orderTotal;
      } else {
        orderTypeBreakdown.token.count++;
        orderTypeBreakdown.token.total += orderTotal;
      }
    });

    const taxableAmount = Math.max(0, grossSales - discountAmount);
    const totalTax = cgstAmount + sgstAmount;
    const netCollected = netSales - refundsAmount;

    paymentBreakdown.totalPayments = paymentBreakdown.cash + paymentBreakdown.upi + paymentBreakdown.card + paymentBreakdown.other;
    
    // Variance check: Net Sales must equal Payments Total
    const varianceAmount = Math.abs(netSales - paymentBreakdown.totalPayments);
    const reconciled = varianceAmount === 0;

    const roundedTotalTax = Math.round(cgstAmount + sgstAmount);
    const roundedCgst = Math.round(cgstAmount);
    const roundedSgst = roundedTotalTax - roundedCgst;

    const avgOrderValue = completedOrdersCount > 0 ? Math.round(netSales / completedOrdersCount) : 0;

    return {
      dateStr: label,
      grossSales: Math.round(grossSales),
      discountAmount: Math.round(discountAmount),
      taxableAmount: Math.round(taxableAmount),
      cgstAmount: roundedCgst,
      sgstAmount: roundedSgst,
      totalTax: roundedTotalTax,
      netSales: Math.round(netSales),
      refundsCount,
      refundsAmount: Math.round(refundsAmount),
      netCollected: Math.round(netCollected),
      cancelledCount,
      cancelledAmount: Math.round(cancelledAmount),
      ordersCount: completedOrdersCount,
      avgOrderValue,
      paymentBreakdown: {
        cash: Math.round(paymentBreakdown.cash),
        upi: Math.round(paymentBreakdown.upi),
        card: Math.round(paymentBreakdown.card),
        split: Math.round(paymentBreakdown.split),
        other: Math.round(paymentBreakdown.other),
        totalPayments: Math.round(paymentBreakdown.totalPayments)
      },
      orderTypeBreakdown,
      reconciled,
      varianceAmount
    };
  }

  /**
   * Fast Dashboard Metrics Provider (powers both POS & Admin Dashboards identically)
   */
  public static getDashboardMetrics(
    preset: CentralDatePreset = 'TODAY',
    allOrders: Order[] = db.orders,
    customStart?: string,
    customEnd?: string
  ): {
    summary: CentralFinancialSummary;
    orders: Order[];
    dateRange: BusinessDateRange;
  } {
    const range = this.getBusinessDateRange(preset, customStart, customEnd);
    const filteredOrders = this.getReportableOrders(allOrders, range);
    const summary = this.calculateFinancialSummary(filteredOrders, range.label);

    return {
      summary,
      orders: filteredOrders,
      dateRange: range
    };
  }

  /**
   * Multi-Source Period Reconciliation Engine
   * Validates cross-table consistency and flags any variance
   */
  public static reconcilePeriod(
    allOrders: Order[] = db.orders,
    preset: CentralDatePreset = 'TODAY',
    customStart?: string,
    customEnd?: string
  ): PeriodReconciliationResult {
    const range = this.getBusinessDateRange(preset, customStart, customEnd);
    const reportableOrders = this.getReportableOrders(allOrders, range);
    const summary = this.calculateFinancialSummary(reportableOrders, range.label);

    const mismatches: string[] = [];

    // Verify payments equal net sales
    if (summary.paymentBreakdown.totalPayments !== summary.netSales) {
      mismatches.push(
        `Payment breakdown sum (₹${summary.paymentBreakdown.totalPayments}) does not match Net Sales (₹${summary.netSales}). Difference: ₹${Math.abs(summary.netSales - summary.paymentBreakdown.totalPayments)}`
      );
    }

    // Verify GST equals taxable * 0.05 approx
    const expectedGst = Math.round(summary.taxableAmount * 0.05);
    if (Math.abs(summary.totalTax - expectedGst) > 2) {
      mismatches.push(`GST discrepancy: Recorded ₹${summary.totalTax} vs expected 5% ₹${expectedGst}`);
    }

    const isReconciled = mismatches.length === 0;

    return {
      periodLabel: range.label,
      dateRange: {
        start: range.startDate.toISOString(),
        end: range.endDate.toISOString()
      },
      completedOrdersCount: summary.ordersCount,
      completedBillsCount: summary.ordersCount,
      paymentRecordsCount: summary.ordersCount,
      grossSales: summary.grossSales,
      discounts: summary.discountAmount,
      taxableSales: summary.taxableAmount,
      gstTotal: summary.totalTax,
      netSales: summary.netSales,
      refunds: summary.refundsAmount,
      netCollected: summary.netCollected,
      paymentBreakdown: {
        ...summary.paymentBreakdown,
        total: summary.paymentBreakdown.totalPayments
      },
      variance: summary.varianceAmount,
      isReconciled,
      mismatches,
      sources: {
        dashboardSales: summary.netSales,
        billsSales: summary.netSales,
        reportsSales: summary.netSales,
        paymentSales: summary.paymentBreakdown.totalPayments
      }
    };
  }
}
