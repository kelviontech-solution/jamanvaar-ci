import { Order, OrderStatus } from '@jamanvaar/types';
import { isUnpaidOpenOrder } from '@jamanvaar/database';
import { formatDate, formatINR, formatTime, toCsvRow } from '@jamanvaar/utils';

export interface DaySummary {
  dateKey: string; // YYYY-MM-DD
  date: Date;
  formattedDate: string; // e.g. "28 AUGUST 2026"
  dayOfWeek: string; // e.g. "Friday"
  isToday: boolean;
  isYesterday: boolean;
  isLive: boolean; // active current business day
  totalSales: number;
  grossSales: number;
  openBills: number;
  netSales: number;
  orderCount: number;
  completedOrders: number;
  activeOrders: number;
  cancelledOrders: number;
  refundedOrders: number;
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
    dineIn: number;
    takeaway: number;
    delivery: number;
    token: number;
  };
  discounts: number;
  refunds: number;
  tax: number;
  topItems: Array<{ name: string; quantity: number; revenue: number }>;
  cashierBreakdown: Array<{ name: string; ordersCount: number; sales: number }>;
  captainBreakdown: Array<{ name: string; ordersCount: number; tablesCount: number; sales: number }>;
  tableBreakdown: Array<{ tableNumber: string; ordersCount: number; sales: number }>;
  cancelledList: Array<{
    orderId: string;
    orderNumber: string;
    totalAmount: number;
    reason?: string;
    cancelledBy?: string;
    time: string;
  }>;
  refundsList: Array<{
    orderId: string;
    orderNumber: string;
    originalAmount: number;
    refundAmount: number;
    reason?: string;
    approvedBy?: string;
    time: string;
  }>;
  orders: Order[];
}

export type DateFilterPreset =
  | 'TODAY'
  | 'YESTERDAY'
  | '7_DAYS'
  | '30_DAYS'
  | 'THIS_MONTH'
  | 'THIS_YEAR'
  | 'CUSTOM';

export class DayOrdersService {
  /**
   * Calculates business day key (YYYY-MM-DD) respecting restaurant business day start hour
   * (e.g. 06:00 AM. Orders placed between 00:00 and 05:59 AM belong to previous calendar day).
   */
  public static getBusinessDateKey(
    dateInput: Date | string,
    businessDayStartsAtHour: number = 6
  ): string {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];

    const hour = d.getHours();
    const adjusted = new Date(d);
    if (hour < businessDayStartsAtHour) {
      // Order belongs to previous business day
      adjusted.setDate(adjusted.getDate() - 1);
    }
    const year = adjusted.getFullYear();
    const month = String(adjusted.getMonth() + 1).padStart(2, '0');
    const day = String(adjusted.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Computes rich day summary for a single business day key
   */
  public static getDaySummary(
    allOrders: Order[],
    dateKey: string,
    businessDayStartsAtHour: number = 6
  ): DaySummary {
    const dayOrders = allOrders.filter(
      (o) => this.getBusinessDateKey(o.createdAt, businessDayStartsAtHour) === dateKey
    );

    const [y, m, d] = dateKey.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d, 12, 0, 0);

    const now = new Date();
    const todayKey = this.getBusinessDateKey(now, businessDayStartsAtHour);
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayKey = this.getBusinessDateKey(yesterdayDate, businessDayStartsAtHour);

    const isToday = dateKey === todayKey;
    const isYesterday = dateKey === yesterdayKey;

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = [
      'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
      'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
    ];

    const formattedDate = `${d} ${monthNames[m - 1]} ${y}`;
    const dayOfWeek = dayNames[dateObj.getDay()];

    let totalSales = 0;
    let grossSales = 0;
    let openBills = 0;
    let discounts = 0;
    let refunds = 0;
    let tax = 0;

    let completedOrders = 0;
    let activeOrders = 0;
    let cancelledOrders = 0;
    let refundedOrders = 0;

    const paymentBreakdown = {
      cash: 0,
      upi: 0,
      card: 0,
      wallet: 0,
      split: 0,
      other: 0
    };

    const orderTypeBreakdown = {
      dineIn: 0,
      takeaway: 0,
      delivery: 0,
      token: 0
    };

    const itemCounts = new Map<string, { name: string; quantity: number; revenue: number }>();
    const cashierMap = new Map<string, { ordersCount: number; sales: number }>();
    const captainMap = new Map<string, { ordersCount: number; tables: Set<string>; sales: number }>();
    const tableMap = new Map<string, { ordersCount: number; sales: number }>();

    const cancelledList: DaySummary['cancelledList'] = [];
    const refundsList: DaySummary['refundsList'] = [];

    // Process all orders for this day
    dayOrders.forEach((o) => {
      const isCancelled = o.orderStatus === 'CANCELLED';
      const isRefunded = o.orderStatus === 'REFUNDED';

      if (isCancelled) {
        cancelledOrders++;
        cancelledList.push({
          orderId: o.id,
          orderNumber: o.orderNumber,
          totalAmount: o.totalAmount,
          reason: 'Customer / Counter Request',
          cancelledBy: o.cashierName || 'Cashier',
          time: formatTime(o.createdAt)
        });
        return; // Don't add to sales
      }

      if (isRefunded) {
        refundedOrders++;
        refunds += o.totalAmount;
        refundsList.push({
          orderId: o.id,
          orderNumber: o.orderNumber,
          originalAmount: o.totalAmount,
          refundAmount: o.totalAmount,
          reason: 'Customer return / Dispute',
          approvedBy: 'Manager',
          time: formatTime(o.updatedAt || o.createdAt)
        });
      } else if (o.orderStatus === 'COMPLETED' || o.paymentStatus === 'SUCCESS') {
        completedOrders++;
      } else {
        activeOrders++;
      }

      // Still open and unpaid (in the kitchen, bill requested, pay-at-counter): listed as an order, but it is
      // not a sale and not collected money until it is settled (BUG-151/161).
      if (isUnpaidOpenOrder(o)) {
        openBills += o.totalAmount;
        return;
      }

      // Reconciled accounting sums
      totalSales += o.totalAmount;
      grossSales += o.subtotal || o.totalAmount;
      discounts += o.discountAmount || 0;
      tax += o.taxAmount || ((o.cgstAmount || 0) + (o.sgstAmount || 0));

      // Payment allocations
      const pMethod = (o.paymentMethod || '').toUpperCase();
      if (pMethod.includes('CASH')) {
        paymentBreakdown.cash += o.totalAmount;
      } else if (pMethod.includes('UPI')) {
        paymentBreakdown.upi += o.totalAmount;
      } else if (pMethod.includes('CARD') || pMethod.includes('EDC') || pMethod.includes('POS')) {
        paymentBreakdown.card += o.totalAmount;
      } else if (pMethod.includes('WALLET') || pMethod.includes('PAYTM')) {
        paymentBreakdown.wallet += o.totalAmount;
      } else if (pMethod.includes('SPLIT')) {
        paymentBreakdown.split += o.totalAmount;
      } else {
        paymentBreakdown.other += o.totalAmount;
      }

      // Order Type Breakdown
      const oType = (o.orderType || '').toUpperCase();
      if (oType.includes('DINE')) {
        orderTypeBreakdown.dineIn++;
      } else if (oType.includes('TAKEAWAY') || oType.includes('PARCEL')) {
        orderTypeBreakdown.takeaway++;
      } else if (oType.includes('DELIVERY')) {
        orderTypeBreakdown.delivery++;
      } else {
        orderTypeBreakdown.token++;
      }

      // Top Items Map
      if (o.items && Array.isArray(o.items)) {
        o.items.forEach((it) => {
          const key = it.name;
          const curr = itemCounts.get(key) || { name: it.name, quantity: 0, revenue: 0 };
          curr.quantity += it.quantity;
          curr.revenue += it.totalPrice;
          itemCounts.set(key, curr);
        });
      }

      // Cashier breakdown
      const cashier = o.cashierName || 'Unassigned cashier';
      const cStat = cashierMap.get(cashier) || { ordersCount: 0, sales: 0 };
      cStat.ordersCount++;
      cStat.sales += o.totalAmount;
      cashierMap.set(cashier, cStat);

      // Captain breakdown
      const captain = o.captainName || (o.tableNumber ? 'Unassigned captain' : undefined);
      if (captain) {
        const captStat = captainMap.get(captain) || { ordersCount: 0, tables: new Set<string>(), sales: 0 };
        captStat.ordersCount++;
        if (o.tableNumber) captStat.tables.add(o.tableNumber);
        captStat.sales += o.totalAmount;
        captainMap.set(captain, captStat);
      }

      // Table breakdown
      if (o.tableNumber) {
        const tblKey = `Table ${o.tableNumber}`;
        const tStat = tableMap.get(tblKey) || { ordersCount: 0, sales: 0 };
        tStat.ordersCount++;
        tStat.sales += o.totalAmount;
        tableMap.set(tblKey, tStat);
      }
    });

    const netSales = Math.max(0, totalSales - refunds);
    const validOrdersCount = completedOrders + refundedOrders;
    const avgOrderValue = validOrdersCount > 0 ? Math.round(totalSales / validOrdersCount) : 0;

    // Top ranked items sorted by quantity
    const topItems = Array.from(itemCounts.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    // Cashier performance sorted by sales
    const cashierBreakdown = Array.from(cashierMap.entries())
      .map(([name, data]) => ({ name, ordersCount: data.ordersCount, sales: data.sales }))
      .sort((a, b) => b.sales - a.sales);

    // Captain performance sorted by sales
    const captainBreakdown = Array.from(captainMap.entries())
      .map(([name, data]) => ({
        name,
        ordersCount: data.ordersCount,
        tablesCount: data.tables.size || 1,
        sales: data.sales
      }))
      .sort((a, b) => b.sales - a.sales);

    // Table breakdown sorted by sales
    const tableBreakdown = Array.from(tableMap.entries())
      .map(([tableNumber, data]) => ({
        tableNumber,
        ordersCount: data.ordersCount,
        sales: data.sales
      }))
      .sort((a, b) => b.sales - a.sales);

    // Sort day's orders newest first by default
    const sortedOrders = [...dayOrders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return {
      dateKey,
      date: dateObj,
      formattedDate,
      dayOfWeek,
      isToday,
      isYesterday,
      isLive: isToday,
      totalSales,
      grossSales,
      openBills,
      netSales,
      orderCount: dayOrders.length,
      completedOrders,
      activeOrders,
      cancelledOrders,
      refundedOrders,
      avgOrderValue,
      paymentBreakdown,
      orderTypeBreakdown,
      discounts,
      refunds,
      tax,
      topItems,
      cashierBreakdown,
      captainBreakdown,
      tableBreakdown,
      cancelledList,
      refundsList,
      orders: sortedOrders
    };
  }

  /**
   * Retrieves and aggregates day summaries for all business days within filter preset
   */
  public static getAllDaysSummaries(
    allOrders: Order[],
    filterPreset: DateFilterPreset = 'TODAY',
    customStart?: Date,
    customEnd?: Date,
    businessDayStartsAtHour: number = 6
  ): DaySummary[] {
    const allDateKeysSet = new Set<string>();

    // Discover all date keys from actual database orders
    allOrders.forEach((o) => {
      allDateKeysSet.add(this.getBusinessDateKey(o.createdAt, businessDayStartsAtHour));
    });

    // Always include today
    const now = new Date();
    allDateKeysSet.add(this.getBusinessDateKey(now, businessDayStartsAtHour));

    // Convert date keys to sorted list (newest first)
    const sortedKeys = Array.from(allDateKeysSet).sort((a, b) => b.localeCompare(a));

    const todayKey = this.getBusinessDateKey(now, businessDayStartsAtHour);
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayKey = this.getBusinessDateKey(yesterdayDate, businessDayStartsAtHour);

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysKey = this.getBusinessDateKey(sevenDaysAgo, businessDayStartsAtHour);

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysKey = this.getBusinessDateKey(thirtyDaysAgo, businessDayStartsAtHour);

    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const monthPrefix = `${currentYear}-${currentMonth}`;
    const yearPrefix = `${currentYear}`;

    // Filter date keys according to preset
    const filteredKeys = sortedKeys.filter((key) => {
      switch (filterPreset) {
        case 'TODAY':
          return key === todayKey;
        case 'YESTERDAY':
          return key === yesterdayKey;
        case '7_DAYS':
          return key >= sevenDaysKey;
        case '30_DAYS':
          return key >= thirtyDaysKey;
        case 'THIS_MONTH':
          return key.startsWith(monthPrefix);
        case 'THIS_YEAR':
          return key.startsWith(yearPrefix);
        case 'CUSTOM': {
          if (!customStart && !customEnd) return true;
          const kDate = new Date(key);
          if (customStart && kDate < customStart) return false;
          if (customEnd && kDate > customEnd) return false;
          return true;
        }
        default:
          return true;
      }
    });

    return filteredKeys.map((key) => this.getDaySummary(allOrders, key, businessDayStartsAtHour));
  }

  /**
   * Exports day orders to clean CSV string
   */
  public static exportDayOrdersCsv(summary: DaySummary): string {
    const headers = [
      'Order #',
      'Token #',
      'Time',
      'Order Type',
      'Table',
      'Customer Name',
      'Customer Phone',
      'Items Count',
      'Subtotal',
      'Discount',
      'Tax (GST)',
      'Total Amount',
      'Payment Method',
      'Payment Status',
      'Order Status',
      'Cashier',
      'Captain'
    ];

    // B2-061: customer name/phone/cashier/captain are free text exported without any defense
    // against CSV/formula injection before this fix — toCsvRow sanitizes every field uniformly.
    const rows = summary.orders.map((o) => [
      o.orderNumber,
      o.tokenNumber,
      formatTime(o.createdAt),
      o.orderType,
      o.tableNumber ? 'Table ' + o.tableNumber : 'Counter',
      o.customerName || 'Walk-in',
      o.customerPhone || '',
      o.items.length,
      o.subtotal,
      o.discountAmount || 0,
      o.taxAmount || 0,
      o.totalAmount,
      o.paymentMethod,
      o.paymentStatus,
      o.orderStatus,
      o.cashierName || 'Cashier',
      o.captainName || ''
    ]);

    return [toCsvRow(headers), ...rows.map(toCsvRow)].join('\r\n');
  }

  /**
   * Exports multi-day summary report to CSV
   */
  public static exportAllDaysCsv(summaries: DaySummary[]): string {
    const headers = [
      'Date Key',
      'Date',
      'Day of Week',
      'Total Sales',
      'Orders Count',
      'Avg Order Value',
      'Cash',
      'UPI',
      'Card',
      'Wallet / Other',
      'Dine-In Orders',
      'Takeaway Orders',
      'Delivery Orders',
      'Token Orders',
      'Discounts',
      'Refunds',
      'GST Tax',
      'Net Sales'
    ];

    const rows = summaries.map((s) => [
      s.dateKey,
      s.formattedDate,
      s.dayOfWeek,
      s.totalSales,
      s.orderCount,
      s.avgOrderValue,
      s.paymentBreakdown.cash,
      s.paymentBreakdown.upi,
      s.paymentBreakdown.card,
      s.paymentBreakdown.wallet + s.paymentBreakdown.split + s.paymentBreakdown.other,
      s.orderTypeBreakdown.dineIn,
      s.orderTypeBreakdown.takeaway,
      s.orderTypeBreakdown.delivery,
      s.orderTypeBreakdown.token,
      s.discounts,
      s.refunds,
      s.tax,
      s.netSales
    ]);

    return [toCsvRow(headers), ...rows.map(toCsvRow)].join('\r\n');
  }
}
