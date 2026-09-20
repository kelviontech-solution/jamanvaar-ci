import { db } from '@jamanvaar/database';
import { Order, MenuItem, Category, DiningTable, User } from '@jamanvaar/types';
import { formatDate, formatINR, formatTime } from '@jamanvaar/utils';

export type ReportPeriodPreset =
  | 'TODAY'
  | 'YESTERDAY'
  | 'LAST_7_DAYS'
  | 'LAST_30_DAYS'
  | 'THIS_MONTH'
  | 'LAST_MONTH'
  | 'THIS_YEAR'
  | 'CUSTOM';

export type ComparePeriodPreset =
  | 'NONE'
  | 'PREVIOUS_PERIOD'
  | 'PREVIOUS_DAY'
  | 'PREVIOUS_WEEK'
  | 'PREVIOUS_MONTH'
  | 'PREVIOUS_YEAR';

export type ReportCategoryKey =
  | 'SALES'
  | 'MENU'
  | 'FINANCIAL'
  | 'OPERATIONS'
  | 'CUSTOMERS'
  | 'INVENTORY';

export type ReportDesignTheme =
  | 'MODERN_RESTAURANT'
  | 'CLASSIC_ACCOUNTING'
  | 'EXECUTIVE_DASHBOARD'
  | 'COMPACT_POS'
  | 'PREMIUM_INSIGHTS';

export interface ReportDateRange {
  startDate: Date;
  endDate: Date;
  preset: ReportPeriodPreset;
  label: string;
}

export interface ReportFilterOptions {
  orderType?: string;
  paymentMethod?: string;
  categoryId?: string;
  station?: string;
  captainId?: string;
  cashierId?: string;
  tableNumber?: string;
  customerPhone?: string;
  searchQuery?: string;
}

export interface MetricWithVariance {
  current: number;
  previous?: number;
  diffPercent?: number;
  diffAmount?: number;
  isPositiveGood?: boolean;
}

export interface ReportSummaryMetrics {
  grossSales: MetricWithVariance;
  discountAmount: MetricWithVariance;
  cgstAmount: MetricWithVariance;
  sgstAmount: MetricWithVariance;
  totalTax: MetricWithVariance;
  netSales: MetricWithVariance;
  ordersCount: MetricWithVariance;
  avgOrderValue: MetricWithVariance;
  cashCollected: MetricWithVariance;
  upiCollected: MetricWithVariance;
  cardCollected: MetricWithVariance;
  splitCollected: MetricWithVariance;
  otherCollected: MetricWithVariance;
  refundsCount: MetricWithVariance;
  refundsAmount: MetricWithVariance;
  cancelledCount: MetricWithVariance;
  cancelledAmount: MetricWithVariance;
  totalGuests: MetricWithVariance;
  avgPrepTimeMinutes: MetricWithVariance;
}

export interface HourlySalesBucket {
  hour: number;
  label: string;
  sales: number;
  ordersCount: number;
  avgOrderValue: number;
}

export interface DayRow {
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

export interface DishPerformanceRow {
  id: string;
  name: string;
  sku: string;
  categoryName: string;
  quantitySold: number;
  grossRevenue: number;
  avgSellingPrice: number;
  revenueSharePercent: number;
  foodCostEstimate: number;
  grossMarginPercent: number;
}

export interface CategoryPerformanceRow {
  categoryId: string;
  categoryName: string;
  dishesCount: number;
  itemsSold: number;
  grossRevenue: number;
  revenueSharePercent: number;
}

export interface TablePerformanceRow {
  tableNumber: string;
  tableName: string;
  capacity: number;
  ordersCount: number;
  grossSales: number;
  avgOrderValue: number;
  turnoverCount: number;
}

export interface StaffPerformanceRow {
  staffId: string;
  staffName: string;
  role: string;
  ordersCount: number;
  grossSales: number;
  avgOrderValue: number;
  cashCollected: number;
  upiCollected: number;
  cardCollected: number;
}

export interface StationPerformanceRow {
  stationName: string;
  kotCount: number;
  itemsCount: number;
  // null when no KOT at this station in-range has actually reached READY
  // yet — there is no real timing data to average, so we say so instead
  // of guessing a number.
  avgPrepMinutes: number | null;
  delayedKotCount: number;
}

export interface CustomerReportRow {
  phone: string;
  name: string;
  visitsCount: number;
  totalSpent: number;
  avgSpend: number;
  lastVisitDate: string;
  loyaltyPoints: number;
}

export interface InventoryReportRow {
  id: string;
  name: string;
  sku: string;
  unit: string;
  currentStock: number;
  minThreshold: number;
  unitCost: number;
  totalStockValue: number;
  usageCount: number;
  status: 'OPTIMAL' | 'LOW' | 'CRITICAL';
}

export interface GstTaxBreakdownRow {
  taxRatePercent: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  totalTax: number;
  invoicesCount: number;
}

export interface EodReconciliationData {
  openingCash: number;
  cashSales: number;
  cashRefunds: number;
  cashExpenses: number;
  expectedCash: number;
  // null until the business day(s) covering this range have actually been
  // closed with a manager-entered cash count — never fabricated to match
  // expectedCash, since that would hide a real shortage/overage.
  actualCashCounted: number | null;
  cashDifference: number | null;
  isBalanced: boolean | null;
  upiSales: number;
  cardSales: number;
  totalSales: number;
  totalOrders: number;
  cancelledOrders: number;
  discountsTotal: number;
  taxTotal: number;
}

export class ReportDataEngine {
  /**
   * Resolve Date Range from Preset or Custom Dates
   */
  public static getDateRange(preset: ReportPeriodPreset, customStart?: string, customEnd?: string): ReportDateRange {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    switch (preset) {
      case 'TODAY':
        return {
          startDate: startOfToday,
          endDate: endOfToday,
          preset,
          label: `Today (${formatDate(now)})`
        };

      case 'YESTERDAY': {
        const yStart = new Date(startOfToday);
        yStart.setDate(yStart.getDate() - 1);
        const yEnd = new Date(yStart);
        yEnd.setHours(23, 59, 59, 999);
        return {
          startDate: yStart,
          endDate: yEnd,
          preset,
          label: `Yesterday (${formatDate(yStart)})`
        };
      }

      case 'LAST_7_DAYS': {
        const s = new Date(startOfToday);
        s.setDate(s.getDate() - 6);
        return {
          startDate: s,
          endDate: endOfToday,
          preset,
          label: `Last 7 Days (${formatDate(s)} - ${formatDate(now)})`
        };
      }

      case 'LAST_30_DAYS': {
        const s = new Date(startOfToday);
        s.setDate(s.getDate() - 29);
        return {
          startDate: s,
          endDate: endOfToday,
          preset,
          label: `Last 30 Days (${formatDate(s)} - ${formatDate(now)})`
        };
      }

      case 'THIS_MONTH': {
        const s = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        return {
          startDate: s,
          endDate: endOfToday,
          preset,
          label: `This Month (${s.toLocaleString('default', { month: 'long', year: 'numeric' })})`
        };
      }

      case 'LAST_MONTH': {
        const s = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
        const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        return {
          startDate: s,
          endDate: e,
          preset,
          label: `Last Month (${s.toLocaleString('default', { month: 'long', year: 'numeric' })})`
        };
      }

      case 'THIS_YEAR': {
        const s = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        return {
          startDate: s,
          endDate: endOfToday,
          preset,
          label: `This Year (${now.getFullYear()})`
        };
      }

      case 'CUSTOM':
      default: {
        const s = customStart ? new Date(customStart + 'T00:00:00') : new Date(startOfToday);
        const e = customEnd ? new Date(customEnd + 'T23:59:59.999') : new Date(endOfToday);
        return {
          startDate: s,
          endDate: e,
          preset: 'CUSTOM',
          label: `${formatDate(s)} - ${formatDate(e)}`
        };
      }
    }
  }

  /**
   * Resolve Comparison Date Range
   */
  public static getCompareDateRange(current: ReportDateRange, comparePreset: ComparePeriodPreset): ReportDateRange | null {
    if (comparePreset === 'NONE') return null;

    const curStart = current.startDate.getTime();
    const curEnd = current.endDate.getTime();
    const durationMs = curEnd - curStart;

    if (comparePreset === 'PREVIOUS_PERIOD') {
      const prevEnd = new Date(curStart - 1);
      const prevStart = new Date(prevEnd.getTime() - durationMs);
      return {
        startDate: prevStart,
        endDate: prevEnd,
        preset: 'CUSTOM',
        label: `Previous Period (${formatDate(prevStart)} - ${formatDate(prevEnd)})`
      };
    }

    if (comparePreset === 'PREVIOUS_DAY') {
      const pStart = new Date(current.startDate);
      pStart.setDate(pStart.getDate() - 1);
      const pEnd = new Date(current.endDate);
      pEnd.setDate(pEnd.getDate() - 1);
      return {
        startDate: pStart,
        endDate: pEnd,
        preset: 'CUSTOM',
        label: `Previous Day (${formatDate(pStart)})`
      };
    }

    if (comparePreset === 'PREVIOUS_WEEK') {
      const pStart = new Date(current.startDate);
      pStart.setDate(pStart.getDate() - 7);
      const pEnd = new Date(current.endDate);
      pEnd.setDate(pEnd.getDate() - 7);
      return {
        startDate: pStart,
        endDate: pEnd,
        preset: 'CUSTOM',
        label: `Previous Week (${formatDate(pStart)} - ${formatDate(pEnd)})`
      };
    }

    if (comparePreset === 'PREVIOUS_MONTH') {
      const pStart = new Date(current.startDate);
      pStart.setMonth(pStart.getMonth() - 1);
      const pEnd = new Date(current.endDate);
      pEnd.setMonth(pEnd.getMonth() - 1);
      return {
        startDate: pStart,
        endDate: pEnd,
        preset: 'CUSTOM',
        label: `Previous Month (${formatDate(pStart)} - ${formatDate(pEnd)})`
      };
    }

    if (comparePreset === 'PREVIOUS_YEAR') {
      const pStart = new Date(current.startDate);
      pStart.setFullYear(pStart.getFullYear() - 1);
      const pEnd = new Date(current.endDate);
      pEnd.setFullYear(pEnd.getFullYear() - 1);
      return {
        startDate: pStart,
        endDate: pEnd,
        preset: 'CUSTOM',
        label: `Previous Year (${pStart.getFullYear()})`
      };
    }

    return null;
  }

  /**
   * Filter orders by date range and additional criteria
   */
  public static getOrders(range: ReportDateRange, filters?: ReportFilterOptions, includeCancelled = false): Order[] {
    return (db.orders || []).filter((o) => {
      if (!includeCancelled && o.orderStatus === 'CANCELLED') return false;

      const oDate = new Date(o.createdAt);
      if (oDate < range.startDate || oDate > range.endDate) return false;

      if (filters?.orderType && filters.orderType !== 'ALL' && o.orderType !== filters.orderType) return false;
      if (filters?.paymentMethod && filters.paymentMethod !== 'ALL' && o.paymentMethod !== filters.paymentMethod) return false;
      if (filters?.tableNumber && filters.tableNumber !== 'ALL' && o.tableNumber !== filters.tableNumber) return false;
      if (filters?.captainId && filters.captainId !== 'ALL' && ((o as any).captainId !== filters.captainId && o.captainName !== filters.captainId)) return false;
      if (filters?.cashierId && filters.cashierId !== 'ALL' && ((o as any).cashierId !== filters.cashierId && o.cashierName !== filters.cashierId)) return false;
      if (filters?.customerPhone && o.customerPhone !== filters.customerPhone) return false;

      if (filters?.searchQuery) {
        const q = filters.searchQuery.toLowerCase();
        const matchesOrder = o.orderNumber?.toLowerCase().includes(q) || o.tokenNumber?.toLowerCase().includes(q);
        const matchesCust = o.customerName?.toLowerCase().includes(q) || o.customerPhone?.toLowerCase().includes(q);
        const matchesItem = o.items?.some((i) => i.name?.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q));
        if (!matchesOrder && !matchesCust && !matchesItem) return false;
      }

      return true;
    });
  }

  /**
   * Calculate High-Level Summary Metrics
   */
  public static calculateSummary(currentOrders: Order[], prevOrders?: Order[]): ReportSummaryMetrics {
    const calc = (orders: Order[]) => {
      let gross = 0;
      let discounts = 0;
      let cgst = 0;
      let sgst = 0;
      let net = 0;
      let cash = 0;
      let upi = 0;
      let card = 0;
      let split = 0;
      let other = 0;
      let refunds = 0;
      let refundsTotal = 0;
      let guests = 0;
      let totalPrepMinutes = 0;
      let prepCount = 0;

      orders.forEach((o) => {
        if (o.orderStatus === 'CANCELLED') return;

        gross += Number(o.subtotal || 0);
        discounts += Number(o.discountAmount || 0);
        cgst += Number(o.cgstAmount || 0);
        sgst += Number(o.sgstAmount || 0);
        const total = Number(o.totalAmount || 0);
        net += total;
        guests += Number(o.guestCount || 1);

        const pm = (o.paymentMethod || '').toUpperCase();
        if (pm === 'CASH' || pm === 'CASH_AT_COUNTER') cash += total;
        else if (pm === 'UPI' || pm === 'BHARAT_QR') upi += total;
        else if (pm === 'CARD' || pm === 'POS_CARD') card += total;
        else if (pm === 'SPLIT') split += total;
        else other += total;

        const anyO = o as any;
        if (anyO.refundStatus === 'FULL_REFUND' || anyO.refundStatus === 'PARTIAL_REFUND') {
          refunds++;
          refundsTotal += Number(anyO.refundAmount || 0);
        }

        if (anyO.completedAt && o.createdAt) {
          const latency = (new Date(anyO.completedAt).getTime() - new Date(o.createdAt).getTime()) / 60000;
          if (latency > 0 && latency < 180) {
            totalPrepMinutes += latency;
            prepCount++;
          }
        }
      });

      const totalTax = cgst + sgst;
      const count = orders.filter((o) => o.orderStatus !== 'CANCELLED').length;
      const aov = count > 0 ? Math.round(net / count) : 0;
      const avgPrep = prepCount > 0 ? Math.round(totalPrepMinutes / prepCount) : 14;

      return {
        gross,
        discounts,
        cgst,
        sgst,
        totalTax,
        net,
        count,
        aov,
        cash,
        upi,
        card,
        split,
        other,
        refunds,
        refundsTotal,
        guests,
        avgPrep
      };
    };

    const cur = calc(currentOrders);
    const prev = prevOrders ? calc(prevOrders) : undefined;

    const makeMetric = (currVal: number, prevVal?: number, isPositiveGood = true): MetricWithVariance => {
      if (prevVal === undefined || prevVal === 0) {
        return { current: currVal, isPositiveGood };
      }
      const diffAmount = currVal - prevVal;
      const diffPercent = Math.round((diffAmount / prevVal) * 1000) / 10;
      return {
        current: currVal,
        previous: prevVal,
        diffAmount,
        diffPercent,
        isPositiveGood
      };
    };

    return {
      grossSales: makeMetric(cur.gross, prev?.gross, true),
      discountAmount: makeMetric(cur.discounts, prev?.discounts, false),
      cgstAmount: makeMetric(cur.cgst, prev?.cgst, true),
      sgstAmount: makeMetric(cur.sgst, prev?.sgst, true),
      totalTax: makeMetric(cur.totalTax, prev?.totalTax, true),
      netSales: makeMetric(cur.net, prev?.net, true),
      ordersCount: makeMetric(cur.count, prev?.count, true),
      avgOrderValue: makeMetric(cur.aov, prev?.aov, true),
      cashCollected: makeMetric(cur.cash, prev?.cash, true),
      upiCollected: makeMetric(cur.upi, prev?.upi, true),
      cardCollected: makeMetric(cur.card, prev?.card, true),
      splitCollected: makeMetric(cur.split, prev?.split, true),
      otherCollected: makeMetric(cur.other, prev?.other, true),
      refundsCount: makeMetric(cur.refunds, prev?.refunds, false),
      refundsAmount: makeMetric(cur.refundsTotal, prev?.refundsTotal, false),
      cancelledCount: makeMetric(0, 0, false),
      cancelledAmount: makeMetric(0, 0, false),
      totalGuests: makeMetric(cur.guests, prev?.guests, true),
      avgPrepTimeMinutes: makeMetric(cur.avgPrep, prev?.avgPrep, false)
    };
  }

  /**
   * Hourly Performance Breakdown (10 AM to 11 PM)
   */
  public static getHourlySales(orders: Order[]): HourlySalesBucket[] {
    const buckets: Record<number, { sales: number; count: number }> = {};
    for (let h = 9; h <= 23; h++) {
      buckets[h] = { sales: 0, count: 0 };
    }

    orders.forEach((o) => {
      if (o.orderStatus === 'CANCELLED') return;
      const d = new Date(o.createdAt);
      const h = d.getHours();
      if (buckets[h]) {
        buckets[h].sales += Number(o.totalAmount || 0);
        buckets[h].count += 1;
      }
    });

    return Object.keys(buckets).map((k) => {
      const h = parseInt(k, 10);
      const b = buckets[h];
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayHour = h % 12 === 0 ? 12 : h % 12;
      return {
        hour: h,
        label: `${displayHour} ${ampm}`,
        sales: b.sales,
        ordersCount: b.count,
        avgOrderValue: b.count > 0 ? Math.round(b.sales / b.count) : 0
      };
    });
  }

  /**
   * Day-by-Day Matrix
   */
  public static getDayByDayRows(orders: Order[]): DayRow[] {
    const map: Record<string, DayRow> = {};

    orders.forEach((o) => {
      if (o.orderStatus === 'CANCELLED') return;
      const d = new Date(o.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      if (!map[key]) {
        map[key] = {
          dateKey: key,
          displayDate: formatDate(d),
          ordersCount: 0,
          grossSales: 0,
          discount: 0,
          tax: 0,
          netSales: 0,
          cash: 0,
          upi: 0,
          card: 0,
          avgOrderValue: 0
        };
      }

      const row = map[key];
      row.ordersCount += 1;
      row.grossSales += Number(o.subtotal || 0);
      row.discount += Number(o.discountAmount || 0);
      row.tax += Number((o.cgstAmount || 0) + (o.sgstAmount || 0));
      const total = Number(o.totalAmount || 0);
      row.netSales += total;

      const pm = (o.paymentMethod || '').toUpperCase();
      if (pm === 'CASH' || pm === 'CASH_AT_COUNTER') row.cash += total;
      else if (pm === 'UPI' || pm === 'BHARAT_QR') row.upi += total;
      else if (pm === 'CARD' || pm === 'POS_CARD') row.card += total;
    });

    return Object.values(map)
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
      .map((r) => ({
        ...r,
        avgOrderValue: r.ordersCount > 0 ? Math.round(r.netSales / r.ordersCount) : 0
      }));
  }

  /**
   * Top Selling & Slow Moving Dishes
   */
  public static getDishPerformance(orders: Order[]): DishPerformanceRow[] {
    const dishMap: Record<string, { qty: number; gross: number; sku: string; name: string; catId: string }> = {};

    orders.forEach((o) => {
      if (o.orderStatus === 'CANCELLED') return;
      (o.items || []).forEach((it) => {
        const id = it.menuItemId || (it as any).id || it.name;
        if (!dishMap[id]) {
          dishMap[id] = {
            qty: 0,
            gross: 0,
            sku: it.sku || 'SKU-00',
            name: it.name,
            catId: (it as any).categoryId || ''
          };
        }
        dishMap[id].qty += Number(it.quantity || 1);
        dishMap[id].gross += Number(it.totalPrice || ((it.unitPrice || 0) * (it.quantity || 1)));
      });
    });

    const totalRevenue = Object.values(dishMap).reduce((acc, d) => acc + d.gross, 0) || 1;

    return Object.entries(dishMap)
      .map(([id, d]) => {
        const menuItem = (db.menuItems || []).find((m) => m.id === id || m.name === d.name);
        const category = (db.categories || []).find((c) => c.id === (menuItem?.categoryId || d.catId));
        const avgSellingPrice = d.qty > 0 ? Math.round(d.gross / d.qty) : 0;
        const foodCostEstimate = Math.round(avgSellingPrice * 0.32); // 32% food cost heuristic
        const grossMarginPercent = avgSellingPrice > 0 ? Math.round(((avgSellingPrice - foodCostEstimate) / avgSellingPrice) * 100) : 68;

        return {
          id,
          name: d.name,
          sku: menuItem?.sku || d.sku,
          categoryName: category?.name || 'Main Menu',
          quantitySold: d.qty,
          grossRevenue: d.gross,
          avgSellingPrice,
          revenueSharePercent: Math.round((d.gross / totalRevenue) * 1000) / 10,
          foodCostEstimate,
          grossMarginPercent
        };
      })
      .sort((a, b) => b.grossRevenue - a.grossRevenue);
  }

  /**
   * Category Breakdown
   */
  public static getCategoryPerformance(orders: Order[]): CategoryPerformanceRow[] {
    const catMap: Record<string, { name: string; count: number; itemsSold: number; gross: number }> = {};

    orders.forEach((o) => {
      if (o.orderStatus === 'CANCELLED') return;
      (o.items || []).forEach((it) => {
        const menuItem = (db.menuItems || []).find((m) => m.id === it.menuItemId || m.name === it.name);
        const cat = (db.categories || []).find((c) => c.id === (menuItem?.categoryId || (it as any).categoryId)) || {
          id: 'cat-general',
          name: 'General'
        };

        if (!catMap[cat.id]) {
          catMap[cat.id] = { name: cat.name, count: 0, itemsSold: 0, gross: 0 };
        }
        catMap[cat.id].itemsSold += Number(it.quantity || 1);
        catMap[cat.id].gross += Number(it.totalPrice || ((it.unitPrice || 0) * (it.quantity || 1)));
      });
    });

    const totalRev = Object.values(catMap).reduce((acc, c) => acc + c.gross, 0) || 1;

    return Object.entries(catMap).map(([id, c]) => {
      const dishesCount = (db.menuItems || []).filter((m) => m.categoryId === id).length;
      return {
        categoryId: id,
        categoryName: c.name,
        dishesCount: dishesCount || 1,
        itemsSold: c.itemsSold,
        grossRevenue: c.gross,
        revenueSharePercent: Math.round((c.gross / totalRev) * 1000) / 10
      };
    }).sort((a, b) => b.grossRevenue - a.grossRevenue);
  }

  /**
   * Table Performance Breakdown
   */
  public static getTablePerformance(orders: Order[]): TablePerformanceRow[] {
    const tableMap: Record<string, { name: string; capacity: number; count: number; sales: number }> = {};

    (db.tables || []).forEach((tbl) => {
      tableMap[tbl.tableNumber] = {
        name: `Table ${tbl.tableNumber} (${tbl.zone || 'Hall'})`,
        capacity: tbl.capacity || 4,
        count: 0,
        sales: 0
      };
    });

    orders.forEach((o) => {
      if (o.orderStatus === 'CANCELLED' || !o.tableNumber) return;
      if (!tableMap[o.tableNumber]) {
        tableMap[o.tableNumber] = {
          name: `Table ${o.tableNumber}`,
          capacity: 4,
          count: 0,
          sales: 0
        };
      }
      tableMap[o.tableNumber].count += 1;
      tableMap[o.tableNumber].sales += Number(o.totalAmount || 0);
    });

    return Object.entries(tableMap).map(([num, t]) => ({
      tableNumber: num,
      tableName: t.name,
      capacity: t.capacity,
      ordersCount: t.count,
      grossSales: t.sales,
      avgOrderValue: t.count > 0 ? Math.round(t.sales / t.count) : 0,
      turnoverCount: t.count
    })).sort((a, b) => b.grossSales - a.grossSales);
  }

  /**
   * Staff (Captain & Cashier) Performance
   */
  public static getStaffPerformance(orders: Order[]): StaffPerformanceRow[] {
    const staffMap: Record<string, StaffPerformanceRow> = {};

    (db.users || []).forEach((st: User) => {
      staffMap[st.id] = {
        staffId: st.id,
        staffName: st.fullName || st.username,
        role: st.roleId || 'Staff',
        ordersCount: 0,
        grossSales: 0,
        avgOrderValue: 0,
        cashCollected: 0,
        upiCollected: 0,
        cardCollected: 0
      };
    });

    orders.forEach((o) => {
      if (o.orderStatus === 'CANCELLED') return;
      const anyO = o as any;
      const sId = anyO.captainId || anyO.cashierId || 'staff-admin';
      if (!staffMap[sId]) {
        staffMap[sId] = {
          staffId: sId,
          staffName: o.captainName || o.cashierName || 'Staff Member',
          role: anyO.captainId ? 'CAPTAIN' : 'CASHIER',
          ordersCount: 0,
          grossSales: 0,
          avgOrderValue: 0,
          cashCollected: 0,
          upiCollected: 0,
          cardCollected: 0
        };
      }

      const row = staffMap[sId];
      row.ordersCount += 1;
      const total = Number(o.totalAmount || 0);
      row.grossSales += total;

      const pm = (o.paymentMethod || '').toUpperCase();
      if (pm === 'CASH') row.cashCollected += total;
      else if (pm === 'UPI') row.upiCollected += total;
      else if (pm === 'CARD') row.cardCollected += total;
    });

    return Object.values(staffMap)
      .filter((s) => s.ordersCount > 0)
      .map((s) => ({
        ...s,
        avgOrderValue: s.ordersCount > 0 ? Math.round(s.grossSales / s.ordersCount) : 0
      }))
      .sort((a, b) => b.grossSales - a.grossSales);
  }

  /**
   * Kitchen Station Preparation Breakdown
   */
  public static getStationPerformance(orders: Order[]): StationPerformanceRow[] {
    const stations = [
      'Main Kitchen',
      'Tandoor Section',
      'Curry Station',
      'Beverages Bar',
      'Dessert Counter',
      'Chaat Counter'
    ];

    const orderIds = new Set(orders.map((o) => o.id));

    return stations.map((stName) => {
      const keyword = stName.split(' ')[0];
      let kotCount = 0;
      let itemsCount = 0;
      let delayed = 0;

      orders.forEach((o) => {
        if (o.orderStatus === 'CANCELLED') return;
        const matchingItems = (o.items || []).filter((it) => {
          const mi = (db.menuItems || []).find((m) => m.id === it.menuItemId || m.name === it.name);
          return (mi?.kitchenStation || 'Main Kitchen').includes(keyword);
        });

        if (matchingItems.length > 0) {
          kotCount++;
          itemsCount += matchingItems.reduce((acc, i) => acc + (i.quantity || 1), 0);
          const anyO = o as any;
          if (anyO.isPriority || (anyO.notes && anyO.notes.includes('DELAY'))) {
            delayed++;
          }
        }
      });

      // Real average prep time, derived from actual KOT createdAt -> readyAt
      // timestamps for this station's tickets belonging to an in-range order.
      const completedKots = (db.kots || []).filter(
        (k) => orderIds.has(k.orderId) && k.station.includes(keyword) && k.readyAt
      );
      const avgPrepMinutes = completedKots.length > 0
        ? Math.round(
            completedKots.reduce(
              (acc, k) => acc + (new Date(k.readyAt!).getTime() - new Date(k.createdAt).getTime()) / 60000,
              0
            ) / completedKots.length
          )
        : null;

      return {
        stationName: stName,
        kotCount,
        itemsCount,
        avgPrepMinutes,
        delayedKotCount: delayed
      };
    });
  }

  /**
   * GST Tax Summary (CGST 2.5% + SGST 2.5% = 5% Standard Restaurant GST)
   */
  public static getGstReport(orders: Order[]): GstTaxBreakdownRow[] {
    let taxable = 0;
    let cgst = 0;
    let sgst = 0;
    let invoices = 0;

    orders.forEach((o) => {
      if (o.orderStatus === 'CANCELLED') return;
      invoices++;
      taxable += Number(o.subtotal || 0) - Number(o.discountAmount || 0);
      cgst += Number(o.cgstAmount || 0);
      sgst += Number(o.sgstAmount || 0);
    });

    // Round the total once and split it, so CGST + SGST always equals the tax shown beside them.
    const totalTaxRounded = Math.round(cgst + sgst);
    const cgstRounded = Math.round(cgst);
    return [
      {
        taxRatePercent: 5.0,
        taxableAmount: Math.round(taxable),
        cgstAmount: cgstRounded,
        sgstAmount: totalTaxRounded - cgstRounded,
        totalTax: totalTaxRounded,
        invoicesCount: invoices
      }
    ];
  }

  /**
   * End of Day Reconciliation. Pulls the real cash-drawer state from
   * db.businessDays for whichever business day(s) fall inside the report's
   * date range, instead of assuming a fixed opening float / zero cash-drops
   * / an always-balanced drawer — those were previously hardcoded and could
   * never surface a genuine cash shortage or overage.
   */
  public static getEodReconciliation(orders: Order[], range?: ReportDateRange): EodReconciliationData {
    let cashSales = 0;
    let upiSales = 0;
    let cardSales = 0;
    let totalSales = 0;
    let discounts = 0;
    let taxTotal = 0;
    let refunds = 0;
    let cancelled = 0;

    orders.forEach((o) => {
      if (o.orderStatus === 'CANCELLED') {
        cancelled++;
        return;
      }

      const total = Number(o.totalAmount || 0);
      totalSales += total;
      discounts += Number(o.discountAmount || 0);
      taxTotal += Number((o.cgstAmount || 0) + (o.sgstAmount || 0));

      const pm = (o.paymentMethod || '').toUpperCase();
      if (pm === 'CASH' || pm === 'CASH_AT_COUNTER') cashSales += total;
      else if (pm === 'UPI' || pm === 'BHARAT_QR') upiSales += total;
      else if (pm === 'CARD' || pm === 'POS_CARD') cardSales += total;

      const anyO = o as any;
      if (anyO.refundAmount) {
        refunds += Number(anyO.refundAmount);
      }
    });

    // Resolve the real business day(s) covering this date range.
    const matchingDays = range
      ? (db.businessDays || []).filter((d) => {
          const opened = new Date(d.openedAt);
          return opened >= range.startDate && opened <= range.endDate;
        })
      : (db.businessDays || []).filter((d) => d.status === 'OPEN' || d.status === 'CLOSING' || d.status === 'REOPENED');

    const sortedByOpen = [...matchingDays].sort((a, b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime());
    const opening = sortedByOpen.length > 0 ? Number(sortedByOpen[0].openingCash || 0) : 0;
    const cashIn = matchingDays.reduce((acc, d) => acc + Number(d.cashIn || 0), 0);
    const cashDrops = matchingDays.reduce((acc, d) => acc + Number(d.cashOut || 0), 0);
    const expectedCash = opening + cashSales + cashIn - refunds - cashDrops;

    const allClosed = matchingDays.length > 0 && matchingDays.every((d) => d.status === 'CLOSED' && d.closingCash !== undefined);
    const actualCashCounted = allClosed ? matchingDays.reduce((acc, d) => acc + Number(d.closingCash || 0), 0) : null;
    const cashDifference = actualCashCounted !== null ? actualCashCounted - expectedCash : null;

    return {
      openingCash: opening,
      cashSales,
      cashRefunds: refunds,
      cashExpenses: cashDrops,
      expectedCash,
      actualCashCounted,
      cashDifference,
      upiSales,
      cardSales,
      totalSales,
      totalOrders: orders.filter((o) => o.orderStatus !== 'CANCELLED').length,
      cancelledOrders: cancelled,
      discountsTotal: discounts,
      taxTotal,
      isBalanced: cashDifference !== null ? Math.abs(cashDifference) < 1 : null
    };
  }
}
