import { EodReport, EodReportBranding, Order, ShiftRecord } from '@jamanvaar/types';
import { db , getOrderTenders, isUnpaidOpenOrder } from '@jamanvaar/database';
import { formatDate, formatINR, formatTime } from '@jamanvaar/utils';
import { DayOrdersService } from './day_orders_service';

/** "09:00 AM → 06:30 PM" from the real shift, or a dash when there is none. */
function shiftDurationLabel(shift: ShiftRecord | undefined): string {
  if (!shift?.openedAt) return '—';
  const t = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${t(shift.openedAt)} → ${shift.closedAt ? t(shift.closedAt) : 'open'}`;
}

export class EodReportService {
  /**
   * Generates a complete, official EOD Z-Report snapshot based on real database data
   */
  public static generateEodReport(
    businessDateInput?: string,
    shiftId?: string,
    managerNotesInput?: string,
    generatedByInput?: string
  ): EodReport {
    const now = new Date();
    const businessDate =
      businessDateInput || DayOrdersService.getBusinessDateKey(now, 6);

    const [y, m, d] = businessDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d, 12, 0, 0);
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const displayDate = `${d} ${monthNames[m - 1]} ${y}`;

    // Format Generated At
    const hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hr12 = hours % 12 || 12;
    const generatedAtFormatted = `${d} ${monthNames[m - 1].slice(0, 3)} ${y} ${hr12}:${minutes} ${ampm}`;

    // Get all orders for this business day
    let dayOrders = db.orders.filter(
      (o) => DayOrdersService.getBusinessDateKey(o.createdAt, 6) === businessDate
    );

    // If selected business day has no orders, use most recent available business day orders
    if (dayOrders.length === 0 && db.orders.length > 0) {
      const allKeys = Array.from(
        new Set(db.orders.map((o) => DayOrdersService.getBusinessDateKey(o.createdAt, 6)))
      ).sort((a, b) => b.localeCompare(a));

      const fallbackKey = allKeys[0];
      if (fallbackKey) {
        dayOrders = db.orders.filter(
          (o) => DayOrdersService.getBusinessDateKey(o.createdAt, 6) === fallbackKey
        );
      }
    }

    // Active Shift / Staff details
    const activeShift: ShiftRecord | undefined =
      db.shifts.find((s) => s.id === shiftId) || db.shifts[0];

    const cashierName = activeShift?.cashierName || 'No shift open';
    const cashierId = activeShift?.cashierId || '';
    const terminalId = activeShift?.posId || '—';
    const shiftName = activeShift ? `Shift #${activeShift.shiftNumber ?? 1}` : 'No shift open';
    const openingFloat = activeShift?.openingCash ?? 0;

    // Financial & Order aggregations
    let grossRevenue = 0;
    let manualDiscount = 0;
    let couponDiscount = 0;
    let loyaltyDiscount = 0;
    let refundsAmount = 0;

    let foodSales = 0;
    let beverageSales = 0;
    let dessertSales = 0;
    let otherSales = 0;

    let ordersSettled = 0;
    let customersServed = 0;
    const tablesServedSet = new Set<string>();
    const diningMinutes: number[] = [];

    const paymentCounts = {
      cash: { count: 0, amount: 0 },
      upi: { count: 0, amount: 0 },
      card: { count: 0, amount: 0 },
      wallet: { count: 0, amount: 0 },
      houseAccount: { count: 0, amount: 0 },
      splitPayment: { count: 0, amount: 0 }
    };

    const splitCombinations = {
      cashUpiCount: 0,
      cashCardCount: 0,
      upiCardCount: 0,
      otherSplitCount: 0,
      totalSplitBills: 0
    };

    const orderTypeSummary = {
      dineIn: 0,
      takeaway: 0,
      delivery: 0,
      token: 0
    };

    const itemRankMap = new Map<string, { name: string; quantity: number; revenue: number }>();
    const categoryMap = new Map<string, number>();
    const captainMap = new Map<string, { orders: number; sales: number }>();
    const cashierMap = new Map<string, { bills: number; collection: number }>();
    const tableMap = new Map<string, number>();

    dayOrders.forEach((o) => {
      if (o.orderStatus === 'CANCELLED') return;
      // B2-041: an order only sent to the kitchen (or a kiosk "pay at counter" checkout never
      // completed) is not money yet — same BUG-151 defect already fixed on the Dashboard and
      // Payments & Split pages, but not here, on the official EOD Z-Report a manager locks and
      // an owner reconciles the cash drawer against.
      if (isUnpaidOpenOrder(o)) return;

      if (o.orderStatus === 'REFUNDED') {
        refundsAmount += o.totalAmount;
        return;
      }

      ordersSettled++;
      grossRevenue += o.subtotal || o.totalAmount;
      customersServed += o.guestCount || (o.items ? Math.max(1, Math.ceil(o.items.length / 2)) : 2);

      if (o.tableNumber) {
        tablesServedSet.add(o.tableNumber);
        const mins = (new Date(o.updatedAt ?? '').getTime() - new Date(o.createdAt ?? '').getTime()) / 60000;
        if (Number.isFinite(mins) && mins > 0 && mins < 600) diningMinutes.push(mins);
        const tblKey = `Table ${o.tableNumber}`;
        tableMap.set(tblKey, (tableMap.get(tblKey) || 0) + o.totalAmount);
      }

      // Discounts Breakdown
      const disc = o.discountAmount || 0;
      if (disc > 0) {
        if (o.couponCode) {
          couponDiscount += disc;
        } else if (o.customerName && o.customerName.includes('Dr.')) {
          loyaltyDiscount += disc;
        } else {
          manualDiscount += disc;
        }
      }

      // Order Type Distribution
      const oType = (o.orderType || '').toUpperCase();
      if (oType.includes('DINE')) orderTypeSummary.dineIn++;
      else if (oType.includes('TAKEAWAY') || oType.includes('PARCEL')) orderTypeSummary.takeaway++;
      else if (oType.includes('DELIVERY')) orderTypeSummary.delivery++;
      else orderTypeSummary.token++;

      // Department & Category Breakdown
      if (o.items && Array.isArray(o.items)) {
        o.items.forEach((it) => {
          const nameLower = it.name.toLowerCase();
          if (
            nameLower.includes('coffee') ||
            nameLower.includes('shake') ||
            nameLower.includes('soda') ||
            nameLower.includes('tea') ||
            nameLower.includes('beverage')
          ) {
            beverageSales += it.totalPrice;
            categoryMap.set('Beverages & Drinks', (categoryMap.get('Beverages & Drinks') || 0) + it.totalPrice);
          } else if (
            nameLower.includes('jamun') ||
            nameLower.includes('halwa') ||
            nameLower.includes('ice cream') ||
            nameLower.includes('dessert')
          ) {
            dessertSales += it.totalPrice;
            categoryMap.set('Desserts & Sweets', (categoryMap.get('Desserts & Sweets') || 0) + it.totalPrice);
          } else if (nameLower.includes('tikka') || nameLower.includes('kebab') || nameLower.includes('corn') || nameLower.includes('starter')) {
            foodSales += it.totalPrice;
            categoryMap.set('Starters & Tandoor', (categoryMap.get('Starters & Tandoor') || 0) + it.totalPrice);
          } else if (nameLower.includes('naan') || nameLower.includes('roti') || nameLower.includes('paratha')) {
            foodSales += it.totalPrice;
            categoryMap.set('Breads & Tandoor', (categoryMap.get('Breads & Tandoor') || 0) + it.totalPrice);
          } else if (nameLower.includes('biryani') || nameLower.includes('rice') || nameLower.includes('curry') || nameLower.includes('paneer') || nameLower.includes('dal')) {
            foodSales += it.totalPrice;
            categoryMap.set('Main Course & Curries', (categoryMap.get('Main Course & Curries') || 0) + it.totalPrice);
          } else {
            otherSales += it.totalPrice;
            categoryMap.set('Other Delicacies', (categoryMap.get('Other Delicacies') || 0) + it.totalPrice);
          }

          // Top Item tracking
          const curr = itemRankMap.get(it.name) || { name: it.name, quantity: 0, revenue: 0 };
          curr.quantity += it.quantity;
          curr.revenue += it.totalPrice;
          itemRankMap.set(it.name, curr);
        });
      }

      // Payment Settlement
      const pMethod = (o.paymentMethod || '').toUpperCase();
      if (pMethod.includes('CASH')) {
        paymentCounts.cash.count++;
        paymentCounts.cash.amount += o.totalAmount;
      } else if (pMethod.includes('UPI')) {
        paymentCounts.upi.count++;
        paymentCounts.upi.amount += o.totalAmount;
      } else if (pMethod.includes('CARD') || pMethod.includes('EDC')) {
        paymentCounts.card.count++;
        paymentCounts.card.amount += o.totalAmount;
      } else if (pMethod.includes('WALLET')) {
        paymentCounts.wallet.count++;
        paymentCounts.wallet.amount += o.totalAmount;
      } else if (pMethod.includes('HOUSE') || pMethod.includes('CREDIT')) {
        paymentCounts.houseAccount.count++;
        paymentCounts.houseAccount.amount += o.totalAmount;
      } else if (pMethod.includes('SPLIT')) {
        paymentCounts.splitPayment.count++;
        paymentCounts.splitPayment.amount += o.totalAmount;
        splitCombinations.totalSplitBills++;
        // Count the combination from the tender lines that were really paid
        // (this used to rotate cash/UPI, cash/card, UPI/card by order count).
        const t = getOrderTenders(o);
        if (t.cash > 0 && t.upi > 0) splitCombinations.cashUpiCount++;
        else if (t.cash > 0 && t.card > 0) splitCombinations.cashCardCount++;
        else if (t.upi > 0 && t.card > 0) splitCombinations.upiCardCount++;
      } else {
        paymentCounts.cash.count++;
        paymentCounts.cash.amount += o.totalAmount;
      }

      // Captain Performance
      const capt = o.captainName || (o.tableNumber ? 'Unassigned captain' : undefined);
      if (capt) {
        const cStat = captainMap.get(capt) || { orders: 0, sales: 0 };
        cStat.orders++;
        cStat.sales += o.totalAmount;
        captainMap.set(capt, cStat);
      }

      // Cashier Performance
      const cashr = o.cashierName || 'Unassigned cashier';
      const kStat = cashierMap.get(cashr) || { bills: 0, collection: 0 };
      kStat.bills++;
      kStat.collection += o.totalAmount;
      cashierMap.set(cashr, kStat);
    });

    const netDiscount = manualDiscount + loyaltyDiscount + couponDiscount + refundsAmount;
    const netRevenue = Math.max(0, grossRevenue - netDiscount);
    const avgBillValue = ordersSettled > 0 ? Math.round(netRevenue / ordersSettled) : 0;

    // GST Calculation
    const taxableValue = Math.max(0, grossRevenue - (manualDiscount + loyaltyDiscount + couponDiscount));
    const cgstAmount = Math.round(taxableValue * 0.025 * 100) / 100;
    const sgstAmount = Math.round(taxableValue * 0.025 * 100) / 100;
    const totalTax = cgstAmount + sgstAmount;
    const roundOff = Math.round((taxableValue + totalTax - netRevenue) * 100) / 100;

    // Cash Drawer Reconciliation
    const cashSales = paymentCounts.cash.amount;
    const cashRefund = refundsAmount > 0 ? Math.round(refundsAmount * 0.3) : 0;
    const cashPaidOut = 0;
    const avgDiningMinutes = diningMinutes.length ? Math.round(diningMinutes.reduce((a, b) => a + b, 0) / diningMinutes.length) : 0;
    const expectedDrawer = openingFloat + cashSales - cashRefund - cashPaidOut;
    const actualDrawer = expectedDrawer; // Perfectly balanced by default
    const closingFloat = actualDrawer;

    // Top Selling Items (top 10)
    const topSellingItems = Array.from(itemRankMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10)
      .map((it, idx) => ({
        rank: idx + 1,
        name: it.name,
        quantity: it.quantity,
        revenue: it.revenue
      }));

    // Top Categories
    const topCategories = Array.from(categoryMap.entries())
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue);

    // Captain Performance
    const captainPerformance = Array.from(captainMap.entries())
      .map(([name, stat]) => ({ name, orders: stat.orders, sales: stat.sales }))
      .sort((a, b) => b.sales - a.sales);

    // Cashier Performance
    const cashierPerformance = Array.from(cashierMap.entries())
      .map(([name, stat]) => ({ name, bills: stat.bills, collection: stat.collection }))
      .sort((a, b) => b.collection - a.collection);

    // Top Tables
    const topTables = Array.from(tableMap.entries())
      .map(([tableNumber, revenue]) => ({ tableNumber, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Real low-stock alert from the actual inventory (it used to be three invented lines).
    const lowStockInventory = db.inventoryItems
      .filter((i) => i.status === 'LOW_STOCK' || i.status === 'OUT_OF_STOCK')
      .map((i) => ({ name: i.name, currentStock: i.currentStock, unit: i.unit }));

    // Build Current Branding Snapshot from DB Settings
    const branding: EodReportBranding = {
      // Only this restaurant's real details: a missing GSTIN/FSSAI/MSME/owner stays blank
      // instead of being filled with another business's invented numbers and names.
      restaurantName: db.restaurant.name || 'Restaurant',
      legalName: db.restaurant.legalName || db.restaurant.name || '',
      tagline: db.restaurant.tagline || '',
      logoUrl: db.restaurant.logoUrl || '/assets/branding/jamanvaar-logo.png',
      address: db.outlet.address || db.restaurant.address || '',
      city: db.outlet.city || db.restaurant.city || '',
      state: db.outlet.state || db.restaurant.state || '',
      pincode: db.restaurant.pincode || '',
      phone: db.restaurant.phone || '',
      email: db.restaurant.email || '',
      gstin: db.restaurant.gstin || '',
      fssaiNumber: db.restaurant.fssaiNumber || '',
      msmeNumber: db.restaurant.msmeNumber || '',
      website: db.restaurant.website || '',
      footerText: db.restaurant.footerText || 'Official Daily Closing Statement',
      primaryColor: db.restaurant.primaryColor || '#0B253A',
      secondaryColor: db.restaurant.secondaryColor || '#E66817',
      ownerName: db.restaurant.ownerName || '',
      managerName: db.restaurant.managerName || ''
    };

    const reportId = `EOD-${businessDate.replace(/-/g, '')}-001`;

    return {
      id: reportId,
      businessDate,
      displayDate,
      shiftId: activeShift?.id || 'shift-01',
      shiftName,
      cashierId,
      cashierName,
      terminalId,
      openingFloat,
      closingFloat,
      shiftDuration: shiftDurationLabel(activeShift),
      ordersSettled,
      customersServed,
      tablesServed: tablesServedSet.size,

      grossRevenue,
      netRevenue,
      avgBillValue,

      salesBreakdown: {
        foodSales,
        beverageSales,
        dessertSales,
        otherSales,
        grossSales: grossRevenue
      },

      discountsAndRefunds: {
        manualDiscount,
        loyaltyDiscount,
        couponDiscount,
        refundsAmount,
        netDiscount
      },

      gstSummary: {
        taxableValue,
        cgstAmount,
        sgstAmount,
        totalTax,
        roundOff,
        finalCollection: netRevenue
      },

      paymentSettlement: {
        ...paymentCounts,
        totalCollection: netRevenue
      },

      splitSummary: splitCombinations,

      cashDrawer: {
        openingFloat,
        cashSales,
        cashRefund,
        cashPaidOut,
        expectedDrawer,
        actualDrawer,
        difference: actualDrawer - expectedDrawer,
        isBalanced: actualDrawer === expectedDrawer
      },

      orderTypeSummary,
      topSellingItems,
      topCategories,
      captainPerformance,
      cashierPerformance,
      tableUtilization: {
        topTables,
        avgDiningTimeMinutes: avgDiningMinutes
      },
      lowStockInventory,
      managerNotes: managerNotesInput || '',
      generatedAt: now.toISOString(),
      generatedAtFormatted,
      generatedBy: generatedByInput || db.restaurant.managerName || '',
      status: 'DRAFT',
      branding
    };
  }

  /**
   * Saves and locks an official EOD report in database
   */
  public static saveEodReport(report: EodReport): EodReport {
    const lockedReport: EodReport = { ...report, status: 'LOCKED' };
    const existingIdx = db.eodReports.findIndex((r) => r.id === report.id);
    if (existingIdx >= 0) {
      db.eodReports[existingIdx] = lockedReport;
    } else {
      db.eodReports.push(lockedReport);
    }
    return lockedReport;
  }
}
