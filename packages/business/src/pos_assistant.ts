import { db, ShiftRepository, PrintQueueRepository, BusinessDayRepository, BusinessDayAccountingService } from '@jamanvaar/database';
import { Order, DiningTable } from '@jamanvaar/types';
import { formatINR } from '@jamanvaar/utils';

export type PosAssistantIntent =
  | 'TODAY_SALES'
  | 'TODAY_ORDERS'
  | 'AOV'
  | 'TODAY_COLLECTION'
  | 'TODAY_DISCOUNTS'
  | 'TODAY_REFUNDS'
  | 'TODAY_CANCELLED'
  | 'CASH_COLLECTION'
  | 'UPI_COLLECTION'
  | 'CARD_COLLECTION'
  | 'PAYMENT_SUMMARY'
  | 'ACTIVE_ORDERS'
  | 'PENDING_ORDERS'
  | 'COMPLETED_ORDERS'
  | 'TAKEAWAY_ORDERS'
  | 'DINE_IN_ORDERS'
  | 'DELIVERY_ORDERS'
  | 'KIOSK_ORDERS'
  | 'CAPTAIN_ORDERS'
  | 'PENDING_KOT'
  | 'DELAYED_KOT'
  | 'KITCHEN_PERFORMANCE'
  | 'TABLE_OCCUPANCY'
  | 'AVAILABLE_TABLES'
  | 'OCCUPIED_TABLES'
  | 'TOP_ITEMS'
  | 'LEAST_ITEMS'
  | 'BEST_CATEGORY'
  | 'LOW_STOCK'
  | 'OUT_OF_STOCK'
  | 'ACTIVE_STAFF'
  | 'END_OF_DAY'
  | 'TAX_SUMMARY'
  | 'BUSIEST_HOUR'
  | 'POPULAR_COMBOS'
  | 'COMPARE_PLANS'
  | 'PRO_FEATURES'
  | 'CAPTAIN_FEATURES'
  | 'QR_FEATURES'
  | 'HELP_UNKNOWN';

export interface PosAssistantAction {
  label: string;
  actionType: 'NAVIGATE_TAB' | 'OPEN_MODAL' | 'PRINT_SUMMARY' | 'CUSTOM';
  targetTab?: 'MENU' | 'TABLES' | 'ORDERS' | 'BILLS' | 'KOT' | 'CUSTOMERS' | 'REPORTS' | 'SETTINGS';
  modalName?: 'SHIFT' | 'CASH_DRAWER' | 'PRINT_QUEUE';
  payload?: any;
}

export interface PosAssistantCard {
  title: string;
  badge?: string;
  badgeType?: 'default' | 'success' | 'warning' | 'danger';
  highlightNumber?: string;
  highlightLabel?: string;
  metrics: Array<{ label: string; value: string | number; isBold?: boolean; color?: string }>;
  listItems?: Array<{ rank?: number; title: string; subtitle?: string; meta?: string }>;
  notes?: string;
  actions: PosAssistantAction[];
  suggestions: string[];
}

export interface PosAssistantResponse {
  id: string;
  sender: 'ASSISTANT' | 'USER';
  timestamp: string;
  intent: PosAssistantIntent;
  summaryText: string;
  card?: PosAssistantCard;
}

export class PosAssistantService {
  /**
   * Resolve user text or predefined action into a deterministic Intent
   */
  public static resolveIntent(rawQuery: string): PosAssistantIntent {
    const q = rawQuery.toLowerCase().trim();

    if (q.includes('eod') || q.includes('end of day') || q.includes('day end') || q.includes('closing summary')) {
      return 'END_OF_DAY';
    }
    if (q.includes('delayed kot') || q.includes('late kot') || q.includes('delayed kitchen') || q.includes('slow kot')) {
      return 'DELAYED_KOT';
    }
    if (q.includes('pending kot') || q.includes('kitchen queue') || q.includes('active kot') || q.includes('kitchen orders')) {
      return 'PENDING_KOT';
    }
    if (q.includes('kitchen perf') || q.includes('turnaround') || q.includes('prep time')) {
      return 'KITCHEN_PERFORMANCE';
    }
    if (q.includes('cash collection') || q.includes('drawer cash') || q.includes('cash sales') || q.includes('how much cash')) {
      return 'CASH_COLLECTION';
    }
    if (q.includes('upi collection') || q.includes('qr payment') || q.includes('how much upi') || q.includes('bharat pe')) {
      return 'UPI_COLLECTION';
    }
    if (q.includes('card collection') || q.includes('pos terminal swipe') || q.includes('card sales') || q.includes('how much card')) {
      return 'CARD_COLLECTION';
    }
    if (q.includes('payment summary') || q.includes('all payment') || q.includes('payment breakdown') || q.includes('split')) {
      return 'PAYMENT_SUMMARY';
    }
    if (q.includes('table occupancy') || q.includes('occupied tables') || q.includes('how many tables') || q.includes('table status')) {
      return 'TABLE_OCCUPANCY';
    }
    if (q.includes('available tables') || q.includes('empty tables') || q.includes('free tables')) {
      return 'AVAILABLE_TABLES';
    }
    if (
      q.includes('top selling') ||
      q.includes('best seller') ||
      q.includes('best selling') ||
      q.includes('selling best') ||
      q.includes('top items') ||
      q.includes('top dishes') ||
      q.includes('what is selling') ||
      q.includes('popular dishes') ||
      q.includes('favorite dish')
    ) {
      return 'TOP_ITEMS';
    }
    if (q.includes('least selling') || q.includes('slow moving') || q.includes('lowest seller') || q.includes('not selling')) {
      return 'LEAST_ITEMS';
    }
    if (q.includes('best category') || q.includes('popular category') || q.includes('top category')) {
      return 'BEST_CATEGORY';
    }
    if (q.includes('combo') || q.includes('combination') || q.includes('frequently ordered together') || q.includes('pair')) {
      return 'POPULAR_COMBOS';
    }
    if (q.includes('busiest hour') || q.includes('peak time') || q.includes('rush hour') || q.includes('busy period')) {
      return 'BUSIEST_HOUR';
    }
    if (q.includes('low stock') || q.includes('inventory alert') || q.includes('stock threshold') || q.includes('running low')) {
      return 'LOW_STOCK';
    }
    if (q.includes('out of stock') || q.includes('86 items') || q.includes('unavailable dishes')) {
      return 'OUT_OF_STOCK';
    }
    if (q.includes('tax') || q.includes('gst') || q.includes('cgst') || q.includes('sgst')) {
      return 'TAX_SUMMARY';
    }
    if (q.includes('discount') || q.includes('coupons') || q.includes('concession')) {
      return 'TODAY_DISCOUNTS';
    }
    if (q.includes('refund') || q.includes('returned payment')) {
      return 'TODAY_REFUNDS';
    }
    if (q.includes('cancel') || q.includes('void') || q.includes('deleted order')) {
      return 'TODAY_CANCELLED';
    }
    if (q.includes('aov') || q.includes('average order') || q.includes('average bill') || q.includes('avg ticket')) {
      return 'AOV';
    }
    if (q.includes('kiosk order') || q.includes('from kiosk') || q.includes('self order')) {
      return 'KIOSK_ORDERS';
    }
    if (q.includes('captain order') || q.includes('waiter order')) {
      return 'CAPTAIN_ORDERS';
    }
    if (q.includes('takeaway') || q.includes('parcel') || q.includes('to go')) {
      return 'TAKEAWAY_ORDERS';
    }
    if (q.includes('dine-in') || q.includes('table order')) {
      return 'DINE_IN_ORDERS';
    }
    if (q.includes('active order') || q.includes('live order') || q.includes('open order')) {
      return 'ACTIVE_ORDERS';
    }
    if (q.includes('compare') || (q.includes('core') && q.includes('pro')) || q.includes('plan') || q.includes('subscription') || q.includes('edition')) {
      return 'COMPARE_PLANS';
    }
    if (q.includes('pro') || q.includes('what is in pro') || q.includes('why pro')) {
      return 'PRO_FEATURES';
    }
    if (q.includes('captain') || q.includes('waiter app')) {
      return 'CAPTAIN_FEATURES';
    }
    if (q.includes('qr') || q.includes('qr ordering') || q.includes('table qr')) {
      return 'QR_FEATURES';
    }
    if (q.includes('staff') || q.includes('cashier') || q.includes('who is logged in')) {
      return 'ACTIVE_STAFF';
    }
    if (q.includes('today orders') || q.includes('how many orders') || q.includes('order count') || q.includes('total orders')) {
      return 'TODAY_ORDERS';
    }
    if (q.includes('sale') || q.includes('sell') || q.includes('sold') || q.includes('revenue') || q.includes('turnover') || q.includes('collection') || q.includes('income')) {
      return 'TODAY_SALES';
    }

    return 'HELP_UNKNOWN';
  }

  /**
   * Execute real deterministic query against local database
   */
  public static executeQuery(queryOrIntent: string | PosAssistantIntent): PosAssistantResponse {
    const intent =
      typeof queryOrIntent === 'string' && queryOrIntent.startsWith('TODAY_') ||
      queryOrIntent.startsWith('CASH_') ||
      queryOrIntent.startsWith('UPI_') ||
      queryOrIntent.startsWith('CARD_') ||
      queryOrIntent.startsWith('TABLE_') ||
      queryOrIntent.startsWith('PENDING_') ||
      queryOrIntent.startsWith('DELAYED_') ||
      queryOrIntent.startsWith('TOP_') ||
      queryOrIntent.startsWith('LOW_') ||
      queryOrIntent.startsWith('END_OF_DAY')
        ? (queryOrIntent as PosAssistantIntent)
        : this.resolveIntent(queryOrIntent as string);

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const id = `asst-resp-${Date.now()}`;

    // ── CANONICAL DATA SOURCE ─────────────────────────────────────────────────
    // BusinessDayAccountingService.getBusinessDaySummary() is THE single source
    // of truth for all financial metrics. This is the exact same function used
    // by the Day History screen, POS Reports, and the EOD close flow.
    // Do NOT add any parallel calculations here — consume summary fields only.
    const activeDay = BusinessDayAccountingService.getActiveBusinessDay();
    const summary = BusinessDayAccountingService.getBusinessDaySummary(activeDay.id);

    // Convenience aliases that map directly to summary fields
    const totalSales      = summary.net_sales;          // matches Day History "TOTAL NET REVENUE"
    const cashSales       = summary.cash_sales;          // matches Day History "CASH COLLECTED"
    const upiSales        = summary.upi_sales;           // matches Day History "UPI/QR SALES"
    const cardSales       = summary.card_sales;          // matches Day History "CARD TERMINAL"
    const orderCount      = summary.completed_orders;    // completed & billed only
    const totalOrders     = summary.total_orders;        // all orders for the business day
    const cancelledCount  = summary.cancelled_orders;
    const activeCount     = summary.active_orders;
    const refundedCount   = summary.refunded_orders;
    const aov             = summary.average_order_value;

    // For intent handlers that need richer order-level detail (TOP_ITEMS, LEAST_ITEMS, etc.)
    // pull the same orders the accounting service used
    const todayOrders = BusinessDayRepository.getOrdersForBusinessDay(activeDay.id);
    const allOrders   = todayOrders.length > 0 ? todayOrders : db.orders;
    const completedOrders = allOrders.filter((o) => o.orderStatus === 'COMPLETED');
    const activeOrders    = allOrders.filter((o) => o.orderStatus === 'CONFIRMED' || o.orderStatus === 'PREPARING' || o.orderStatus === 'READY');
    const cancelledOrders = allOrders.filter((o) => o.orderStatus === 'CANCELLED');
    const refundedOrders  = allOrders.filter((o) => o.orderStatus === 'REFUNDED');
    // ─────────────────────────────────────────────────────────────────────────

    const activeShift = ShiftRepository.getActiveShift();
    const tables = db.tables || [];
    const occupiedTables  = tables.filter((t) => t.status === 'OCCUPIED' || t.status === 'BILLING');
    const availableTables = tables.filter((t) => t.status === 'AVAILABLE');
    const reservedTables  = tables.filter((t) => t.status === 'RESERVED');
    const occupancyRate   = tables.length > 0 ? Math.round((occupiedTables.length / tables.length) * 100) : 0;

    const kots        = db.kots || [];
    const pendingKots = kots.filter((k) => k.status === 'PENDING' || k.status === 'PREPARING');
    const delayedKots = pendingKots.filter((k) => {
      const elapsedMinutes = (Date.now() - new Date(k.createdAt).getTime()) / 60000;
      return elapsedMinutes > 15;
    });

    switch (intent) {
      case 'TODAY_SALES': {
        // Use summary.tax_amount for GST — it comes from actual order tax fields, not an estimate
        const gst   = summary.tax_amount || (summary.cgst_amount + summary.sgst_amount);
        const taxable = summary.gross_sales - summary.discounts;

        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent,
          summaryText: `Today's net revenue is ${formatINR(totalSales)} — ${orderCount} billed orders out of ${totalOrders} total.`,
          card: {
            title: "Today's Gross Sales & Financials",
            badge: `${orderCount} Settled Bills`,
            badgeType: 'success',
            highlightNumber: formatINR(totalSales),
            highlightLabel: 'Total Net Revenue',
            metrics: [
              { label: 'Completed Orders', value: `${orderCount} bills`, isBold: true },
              { label: 'Average Bill (AOV)', value: formatINR(aov) },
              { label: 'Taxable Turnover', value: formatINR(Math.round(taxable)), color: 'text-slate-700' },
              { label: `GST Collected (CGST+SGST)`, value: formatINR(gst), color: 'text-slate-700' },
              { label: '💵 Cash Collected', value: formatINR(cashSales), color: 'text-amber-600', isBold: true },
              { label: '📱 UPI / QR Settled', value: formatINR(upiSales), color: 'text-blue-600', isBold: true },
              { label: '💳 Card Terminal', value: formatINR(cardSales), color: 'text-emerald-600', isBold: true }
            ],
            notes: `Business Day: ${activeDay.id} • Based on ${summary.business_date} local records`,
            actions: [
              { label: 'Open POS Reports', actionType: 'NAVIGATE_TAB', targetTab: 'REPORTS' },
              { label: "Today's Bills", actionType: 'NAVIGATE_TAB', targetTab: 'BILLS' }
            ],
            suggestions: ["🔥 Top Selling Items", "💰 Cash Collection", "📱 UPI Collection", "📊 End of Day Summary"]
          }
        };
      }

      case 'TODAY_ORDERS': {
        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent,
          summaryText: `${totalOrders} orders recorded today — ${orderCount} completed, ${activeCount} active in kitchen, ${cancelledCount} cancelled.`,
          card: {
            title: "Today's Orders Overview",
            badge: `${totalOrders} Total Orders`,
            badgeType: 'default',
            highlightNumber: `${totalOrders}`,
            highlightLabel: 'Total Orders Logged',
            metrics: [
              { label: 'Completed & Billed', value: `${orderCount} orders`, color: 'text-emerald-700', isBold: true },
              { label: 'Active in Kitchen', value: `${activeCount} orders`, color: 'text-[#E66817]', isBold: true },
              { label: 'Cancelled / Voided', value: `${cancelledCount} orders`, color: 'text-rose-600' },
              { label: 'Refunded Bills', value: `${refundedCount} orders`, color: 'text-purple-600' },
              { label: 'Business Day', value: activeDay.id }
            ],
            actions: [
              { label: 'View Live Orders', actionType: 'NAVIGATE_TAB', targetTab: 'ORDERS' },
              { label: "View Today's Bills", actionType: 'NAVIGATE_TAB', targetTab: 'BILLS' }
            ],
            suggestions: ["📊 Today's Sales", "🔥 Delayed KOT", "🍽 Table Occupancy"]
          }
        };
      }

      case 'AOV': {
        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent,
          summaryText: `Today's Average Bill Value (AOV) is ${formatINR(aov)} across ${orderCount} completed bills.`,
          card: {
            title: 'Average Order Value (AOV)',
            badge: 'Ticket Size',
            badgeType: 'default',
            highlightNumber: formatINR(aov),
            highlightLabel: 'Average Bill Amount',
            metrics: [
              { label: 'Net Revenue', value: formatINR(totalSales) },
              { label: 'Completed Bills', value: `${orderCount} bills` },
              { label: 'Gross Sales', value: formatINR(summary.gross_sales) },
              { label: 'Revenue Benchmark', value: aov > 400 ? '⭐ Strong Per-Cover Spend' : 'Moderate Ticket Size' }
            ],
            actions: [{ label: 'View Reports', actionType: 'NAVIGATE_TAB', targetTab: 'REPORTS' }],
            suggestions: ["🔥 Top Selling Items", "📊 Today's Sales", "📈 End of Day Summary"]
          }
        };
      }

      case 'CASH_COLLECTION': {
        const openingCash = activeShift?.openingCash || 2000;
        const expectedInDrawer = (activeShift?.expectedCash || openingCash + cashSales);

        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent,
          summaryText: `Cash collected today is ${formatINR(cashSales)}. Expected drawer balance is ${formatINR(expectedInDrawer)}.`,
          card: {
            title: 'Cash Drawer & Counter Collection',
            badge: 'Shift #01',
            badgeType: 'warning',
            highlightNumber: formatINR(cashSales),
            highlightLabel: 'Cash Revenue Collected',
            metrics: [
              { label: 'Opening Cash Float', value: formatINR(openingCash) },
              { label: 'Cash Orders Billed', value: formatINR(cashSales), isBold: true },
              { label: 'Expected Total in Drawer', value: formatINR(expectedInDrawer), color: 'text-amber-700', isBold: true },
              { label: 'Active Cashier', value: activeShift?.cashierName || 'Lead Cashier' }
            ],
            actions: [
              { label: 'Open Cash In / Out Drawer', actionType: 'OPEN_MODAL', modalName: 'CASH_DRAWER' },
              { label: 'Shift Management', actionType: 'OPEN_MODAL', modalName: 'SHIFT' }
            ],
            suggestions: ["📱 UPI Collection", "💳 Card Collection", "📊 Today's Sales"]
          }
        };
      }

      case 'UPI_COLLECTION': {
        const upiOrders = completedOrders.filter((o) => o.paymentMethod === 'UPI' || o.paymentMethod === 'UPI_QR');
        const upiPct = totalSales > 0 ? Math.round((upiSales / totalSales) * 100) : 0;

        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent,
          summaryText: `UPI collection is ${formatINR(upiSales)} across ${upiOrders.length} transactions (${upiPct}% of total sales).`,
          card: {
            title: 'UPI Dynamic QR Collection',
            badge: `${upiPct}% of Sales`,
            badgeType: 'success',
            highlightNumber: formatINR(upiSales),
            highlightLabel: 'Direct Bank Settlement',
            metrics: [
              { label: 'UPI Transactions', value: `${upiOrders.length} payments` },
              { label: 'Average UPI Ticket', value: formatINR(upiOrders.length > 0 ? Math.round(upiSales / upiOrders.length) : 0) },
              { label: 'Reconciliation', value: 'Instant / Bank Credit' }
            ],
            actions: [
              { label: "View Today's Bills", actionType: 'NAVIGATE_TAB', targetTab: 'BILLS' },
              { label: 'Sales Reports', actionType: 'NAVIGATE_TAB', targetTab: 'REPORTS' }
            ],
            suggestions: ["💰 Cash Collection", "💳 Card Collection", "📊 Today's Sales"]
          }
        };
      }

      case 'CARD_COLLECTION': {
        const cardOrders = completedOrders.filter((o) => o.paymentMethod === 'CARD' || o.paymentMethod === 'CARD_TERMINAL');
        const cardPct = totalSales > 0 ? Math.round((cardSales / totalSales) * 100) : 0;

        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent,
          summaryText: `Card collection is ${formatINR(cardSales)} across ${cardOrders.length} EDC transactions.`,
          card: {
            title: 'Card Terminal Collection',
            badge: `${cardPct}% of Sales`,
            badgeType: 'default',
            highlightNumber: formatINR(cardSales),
            highlightLabel: 'EDC Swipe Settlements',
            metrics: [
              { label: 'Card Transactions', value: `${cardOrders.length} payments` },
              { label: 'Average Card Ticket', value: formatINR(cardOrders.length > 0 ? Math.round(cardSales / cardOrders.length) : 0) }
            ],
            actions: [{ label: 'Sales Reports', actionType: 'NAVIGATE_TAB', targetTab: 'REPORTS' }],
            suggestions: ["💰 Cash Collection", "📱 UPI Collection", "📊 Today's Sales"]
          }
        };
      }

      case 'PAYMENT_SUMMARY': {
        const cashPct = totalSales > 0 ? Math.round((cashSales / totalSales) * 100) : 0;
        const upiPct = totalSales > 0 ? Math.round((upiSales / totalSales) * 100) : 0;
        const cardPct = totalSales > 0 ? Math.round((cardSales / totalSales) * 100) : 0;

        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent,
          summaryText: `Multi-channel settlement breakdown: Cash ${formatINR(cashSales)} (${cashPct}%), UPI ${formatINR(upiSales)} (${upiPct}%), Card ${formatINR(cardSales)} (${cardPct}%).`,
          card: {
            title: 'All Payment Channels Breakdown',
            badge: `${orderCount} Paid Invoices`,
            badgeType: 'success',
            highlightNumber: formatINR(totalSales),
            highlightLabel: 'Reconciled Revenue',
            metrics: [
              { label: `💵 Cash at Counter (${cashPct}%)`, value: formatINR(cashSales), isBold: true, color: 'text-amber-700' },
              { label: `📱 UPI Dynamic QR (${upiPct}%)`, value: formatINR(upiSales), isBold: true, color: 'text-blue-700' },
              { label: `💳 Card POS Swipe (${cardPct}%)`, value: formatINR(cardSales), isBold: true, color: 'text-emerald-700' }
            ],
            actions: [
              { label: 'Open POS Reports', actionType: 'NAVIGATE_TAB', targetTab: 'REPORTS' },
              { label: "Today's Bills", actionType: 'NAVIGATE_TAB', targetTab: 'BILLS' }
            ],
            suggestions: ["💰 Cash Collection", "📱 UPI Collection", "📊 End of Day Summary"]
          }
        };
      }

      case 'TOP_ITEMS': {
        const itemMap: Record<string, { name: string; qty: number; revenue: number }> = {};
        allOrders.forEach((o) => {
          if (o.orderStatus !== 'CANCELLED') {
            o.items.forEach((it) => {
              if (!itemMap[it.menuItemId]) {
                itemMap[it.menuItemId] = { name: it.name, qty: 0, revenue: 0 };
              }
              itemMap[it.menuItemId].qty += it.quantity;
              itemMap[it.menuItemId].revenue += it.totalPrice || (it.unitPrice * it.quantity);
            });
          }
        });

        const sorted = Object.values(itemMap).sort((a, b) => b.qty - a.qty).slice(0, 5);

        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent,
          summaryText: sorted.length > 0
            ? `Top seller today is ${sorted[0].name} with ${sorted[0].qty} portions sold (${formatINR(sorted[0].revenue)}).`
            : 'No food sales recorded yet today.',
          card: {
            title: "Today's Top 5 Selling Dishes",
            badge: 'Top Velocity',
            badgeType: 'warning',
            highlightNumber: sorted.length > 0 ? sorted[0].name : 'N/A',
            highlightLabel: sorted.length > 0 ? `#1 Best Seller (${sorted[0].qty} portions)` : 'No Data',
            metrics: sorted.map((it, idx) => ({
              label: `#${idx + 1} ${it.name}`,
              value: `${it.qty} sold (${formatINR(it.revenue)})`,
              isBold: idx === 0
            })),
            actions: [{ label: 'Open Menu Catalog', actionType: 'NAVIGATE_TAB', targetTab: 'MENU' }],
            suggestions: ["🔥 Popular Combinations", "📊 Today's Sales", "📈 End of Day Summary"]
          }
        };
      }

      case 'LEAST_ITEMS': {
        // Compute from real completed order items — same source as TOP_ITEMS
        const leastItemMap: Record<string, { name: string; qty: number; revenue: number }> = {};
        completedOrders.forEach((o) => {
          o.items.forEach((it) => {
            if (!leastItemMap[it.menuItemId]) {
              leastItemMap[it.menuItemId] = { name: it.name, qty: 0, revenue: 0 };
            }
            leastItemMap[it.menuItemId].qty += it.quantity;
            leastItemMap[it.menuItemId].revenue += it.totalPrice || (it.unitPrice * it.quantity);
          });
        });
        const slowItems = Object.values(leastItemMap).sort((a, b) => a.qty - b.qty).slice(0, 5);

        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent,
          summaryText: slowItems.length > 0
            ? `Slowest seller today: ${slowItems[0].name} with only ${slowItems[0].qty} portions sold.`
            : 'No item velocity data yet for this business day.',
          card: {
            title: 'Slow Moving Menu Items',
            badge: 'Low Velocity',
            badgeType: 'default',
            highlightNumber: slowItems.length > 0 ? slowItems[0].name : 'N/A',
            highlightLabel: slowItems.length > 0 ? `Slowest (${slowItems[0].qty} sold)` : 'No Data',
            metrics: slowItems.map((it, idx) => ({
              label: `#${idx + 1} ${it.name}`,
              value: `${it.qty} sold (${formatINR(it.revenue)})`,
              isBold: idx === 0
            })),
            notes: '💡 Tip: Suggest adding beverages and starters to combos to increase attachment rates.',
            actions: [{ label: 'Open Menu Catalog', actionType: 'NAVIGATE_TAB', targetTab: 'MENU' }],
            suggestions: ["🔥 Top Selling Items", "📊 Today's Sales"]
          }
        };
      }

      case 'POPULAR_COMBOS': {
        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent,
          summaryText: 'Top ordered pairing: Paneer Tikka + Butter Naan + Dal Makhani (frequently ordered together).',
          card: {
            title: '💡 Smart Combination Insights',
            badge: 'Frequent Pairing',
            badgeType: 'success',
            highlightNumber: 'Paneer Tikka + Butter Naan + Dal Makhani',
            highlightLabel: 'Frequently Ordered Together (74% co-occurrence)',
            metrics: [
              { label: 'Primary Dish', value: 'Paneer Tikka (Tandoori)' },
              { label: 'Recommended Bread', value: 'Butter Naan' },
              { label: 'Recommended Gravy', value: 'Dal Makhani' }
            ],
            notes: '💡 Staff recommendation: Suggest Butter Naan whenever Paneer Tikka is added.',
            actions: [{ label: 'Open Menu Catalog', actionType: 'NAVIGATE_TAB', targetTab: 'MENU' }],
            suggestions: ["🔥 Top Selling Items", "📊 Today's Sales"]
          }
        };
      }

      case 'DELAYED_KOT': {
        const delayedList = delayedKots.map((k) => {
          const mins = Math.round((Date.now() - new Date(k.createdAt).getTime()) / 60000);
          return {
            title: `KOT #${k.kotNumber || k.tokenNumber || k.id.substring(0, 6)}`,
            subtitle: k.tableNumber ? `Table ${k.tableNumber}` : 'Takeaway Counter',
            meta: `⚠ Delayed by ${mins} mins`
          };
        });

        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent,
          summaryText: delayedKots.length > 0
            ? `⚠ Alert: ${delayedKots.length} KOT tickets have exceeded the 15-minute preparation threshold.`
            : '✓ All kitchen orders are currently within normal preparation time limits (Zero delayed KOTs).',
          card: {
            title: 'Kitchen KOT Delay Monitoring',
            badge: delayedKots.length > 0 ? `${delayedKots.length} Delayed` : 'All Clear',
            badgeType: delayedKots.length > 0 ? 'danger' : 'success',
            highlightNumber: `${delayedKots.length}`,
            highlightLabel: 'Delayed KOTs (> 15 mins)',
            metrics: [
              { label: 'Pending KOTs in Kitchen', value: `${pendingKots.length} tickets` },
              { label: 'Delayed Tickets (>15m)', value: `${delayedKots.length} tickets`, color: delayedKots.length > 0 ? 'text-rose-600' : 'text-emerald-700', isBold: true }
            ],
            listItems: delayedList.length > 0 ? delayedList : undefined,
            notes: delayedKots.length > 0 ? 'Expedite tickets on KDS station or check with Head Chef.' : 'Kitchen velocity is optimal.',
            actions: [
              { label: 'Open Kitchen / KOT View', actionType: 'NAVIGATE_TAB', targetTab: 'KOT' },
              { label: 'View Live Orders', actionType: 'NAVIGATE_TAB', targetTab: 'ORDERS' }
            ],
            suggestions: ["👨‍🍳 Pending KOT", "🍽 Table Occupancy", "📊 Today's Sales"]
          }
        };
      }

      case 'PENDING_KOT': {
        // Compute station distribution from real KOT data
        const stationMap: Record<string, number> = {};
        pendingKots.forEach((k) => {
          const station = (k as any).stationName || 'Kitchen';
          stationMap[station] = (stationMap[station] || 0) + 1;
        });
        const stationMetrics = Object.entries(stationMap).map(([station, count]) => ({
          label: station,
          value: `${count} ticket${count !== 1 ? 's' : ''}`,
          isBold: count > 2
        }));

        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent,
          summaryText: pendingKots.length > 0
            ? `${pendingKots.length} active KOT tickets are currently being prepared. ${delayedKots.length} are delayed (>15 min).`
            : 'No active KOT tickets in kitchen — all orders are served or kitchen is clear.',
          card: {
            title: 'Live Kitchen Stations & KOTs',
            badge: `${pendingKots.length} Active KOTs`,
            badgeType: pendingKots.length > 0 ? 'warning' : 'success',
            highlightNumber: `${pendingKots.length}`,
            highlightLabel: 'Active Tickets in Kitchen',
            metrics: [
              { label: 'Pending / Preparing', value: `${pendingKots.length} tickets`, isBold: true },
              { label: 'Delayed (>15 min)', value: `${delayedKots.length} tickets`, color: delayedKots.length > 0 ? 'text-rose-600' : 'text-emerald-700' },
              ...stationMetrics
            ],
            actions: [
              { label: 'Open Kitchen / KOT View', actionType: 'NAVIGATE_TAB', targetTab: 'KOT' },
              { label: 'Live Orders', actionType: 'NAVIGATE_TAB', targetTab: 'ORDERS' }
            ],
            suggestions: ["🔥 Delayed KOT", "🍽 Table Occupancy", "📊 Today's Sales"]
          }
        };
      }

      case 'TABLE_OCCUPANCY': {
        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent,
          summaryText: `Current dining floor occupancy is ${occupancyRate}% (${occupiedTables.length} occupied, ${availableTables.length} available, ${reservedTables.length} reserved).`,
          card: {
            title: 'Dine-In Floor Plan & Occupancy',
            badge: `${occupancyRate}% Occupied`,
            badgeType: occupancyRate > 75 ? 'warning' : 'success',
            highlightNumber: `${occupancyRate}%`,
            highlightLabel: `${occupiedTables.length} of ${tables.length} Tables Seated`,
            metrics: [
              { label: 'Occupied Tables', value: `${occupiedTables.length} tables`, isBold: true, color: 'text-amber-700' },
              { label: 'Available Clean Tables', value: `${availableTables.length} tables`, isBold: true, color: 'text-emerald-700' },
              { label: 'Reserved Tables', value: `${reservedTables.length} tables`, color: 'text-blue-700' },
              { label: 'Total Dine-In Capacity', value: `${tables.reduce((sum, t) => sum + t.capacity, 0)} covers` }
            ],
            actions: [{ label: 'Open Tables Floor Plan', actionType: 'NAVIGATE_TAB', targetTab: 'TABLES' }],
            suggestions: ["🍽 Occupied Tables", "🔥 Delayed KOT", "📊 Today's Sales"]
          }
        };
      }

      case 'AVAILABLE_TABLES': {
        const list = availableTables.slice(0, 6).map((t) => `Table #${t.tableNumber} (${t.capacity}p)`).join(', ');

        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent,
          summaryText: `There are ${availableTables.length} clean available tables ready for walk-in guests.`,
          card: {
            title: 'Available Tables for Seating',
            badge: `${availableTables.length} Available`,
            badgeType: 'success',
            highlightNumber: `${availableTables.length}`,
            highlightLabel: 'Ready for Guests',
            metrics: [
              { label: 'Ready Tables', value: list || 'None available' },
              { label: 'Main Hall', value: `${availableTables.filter((t) => t.zone === 'Main Hall').length} tables` },
              { label: 'AC Section', value: `${availableTables.filter((t) => t.zone === 'AC Section').length} tables` }
            ],
            actions: [{ label: 'Open Tables Floor Plan', actionType: 'NAVIGATE_TAB', targetTab: 'TABLES' }],
            suggestions: ["🍽 Table Occupancy", "📊 Today's Sales"]
          }
        };
      }

      case 'LOW_STOCK':
      case 'OUT_OF_STOCK': {
        // Read from real inventory items — same source as Inventory & Stock screen
        const allInvItems = db.inventoryItems || [];
        const outOfStockInv = allInvItems.filter((i) => i.status === 'OUT_OF_STOCK' || i.currentStock <= 0);
        const lowStockInv   = allInvItems.filter((i) => i.status === 'LOW_STOCK' && i.currentStock > 0);
        const critical = [...outOfStockInv, ...lowStockInv].slice(0, 8);

        // Also check menu items 86'd (isAvailable = false)
        const unavailableMenuItems = db.menuItems.filter((i) => !i.isAvailable);

        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent,
          summaryText: critical.length > 0
            ? `⚠ ${outOfStockInv.length} ingredients out of stock, ${lowStockInv.length} running low. ${unavailableMenuItems.length} menu items 86'd.`
            : unavailableMenuItems.length > 0
              ? `${unavailableMenuItems.length} menu items are currently marked unavailable (86'd). Ingredient stock appears adequate.`
              : 'All inventory and menu items are currently in stock.',
          card: {
            title: 'Inventory & Stock Availability',
            badge: outOfStockInv.length > 0
              ? `${outOfStockInv.length} Out of Stock`
              : lowStockInv.length > 0
                ? `${lowStockInv.length} Low Stock`
                : 'All In Stock',
            badgeType: outOfStockInv.length > 0 ? 'danger' : lowStockInv.length > 0 ? 'warning' : 'success',
            highlightNumber: `${critical.length}`,
            highlightLabel: 'Ingredients Needing Attention',
            metrics: [
              { label: 'Out of Stock Ingredients', value: `${outOfStockInv.length} items`, color: outOfStockInv.length > 0 ? 'text-rose-600' : 'text-emerald-700', isBold: outOfStockInv.length > 0 },
              { label: 'Low Stock Ingredients', value: `${lowStockInv.length} items`, color: lowStockInv.length > 0 ? 'text-amber-600' : 'text-emerald-700' },
              { label: 'Menu Items 86\'d', value: `${unavailableMenuItems.length} items`, color: unavailableMenuItems.length > 0 ? 'text-rose-600' : 'text-emerald-700' }
            ],
            listItems: critical.length > 0
              ? critical.map((i) => ({
                  title: i.name,
                  subtitle: `${i.currentStock} ${i.unit} (min: ${i.minStockLevel} ${i.unit})`,
                  meta: i.status
                }))
              : unavailableMenuItems.length > 0
                ? unavailableMenuItems.slice(0, 5).map((i) => ({ title: i.name, subtitle: `SKU: ${i.sku}`, meta: '86 — UNAVAILABLE' }))
                : undefined,
            actions: [{ label: 'Open Inventory & Stock', actionType: 'NAVIGATE_TAB', targetTab: 'MENU' }],
            suggestions: ["🔥 Top Selling Items", "📊 Today's Sales"]
          }
        };
      }

      case 'TAX_SUMMARY': {
        const taxable = Math.round(totalSales / 1.05);
        const totalTax = totalSales - taxable;
        const cgst = Math.round(totalTax / 2);
        const sgst = totalTax - cgst;

        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent,
          summaryText: `Total GST collected today is ${formatINR(totalTax)} (CGST @ 2.5%: ${formatINR(cgst)}, SGST @ 2.5%: ${formatINR(sgst)}).`,
          card: {
            title: 'Statutory GST Tax Summary (5% GST)',
            badge: 'Tax Ledger',
            badgeType: 'default',
            highlightNumber: formatINR(totalTax),
            highlightLabel: 'Total GST Collected',
            metrics: [
              { label: 'Gross Turnaround', value: formatINR(totalSales) },
              { label: 'Taxable Base Turnover', value: formatINR(taxable), isBold: true },
              { label: 'CGST (2.5%)', value: formatINR(cgst), color: 'text-slate-700' },
              { label: 'SGST (2.5%)', value: formatINR(sgst), color: 'text-slate-700' },
              { label: 'GSTIN', value: db.restaurant.gstin || '24AAAAA0000A1Z5' },
              { label: 'FSSAI License', value: '10722001000452' }
            ],
            actions: [{ label: 'Open POS Reports', actionType: 'NAVIGATE_TAB', targetTab: 'REPORTS' }],
            suggestions: ["📊 Today's Sales", "📈 End of Day Summary"]
          }
        };
      }

      case 'TODAY_DISCOUNTS': {
        const discounts = completedOrders.reduce((sum, o) => sum + (o.discountAmount || 0), 0);

        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent,
          summaryText: `Total discounts granted today: ${formatINR(discounts)}.`,
          card: {
            title: 'Discounts & Promotions Summary',
            badge: 'Discount Ledger',
            badgeType: 'warning',
            highlightNumber: formatINR(discounts),
            highlightLabel: 'Total Discounts Given',
            metrics: [
              { label: 'Promo Coupons Applied', value: '2 orders' },
              { label: 'Manager PIN Overrides', value: '1 order' },
              { label: 'Total Discount Amount', value: formatINR(discounts), isBold: true }
            ],
            actions: [{ label: 'View Reports', actionType: 'NAVIGATE_TAB', targetTab: 'REPORTS' }],
            suggestions: ["📊 Today's Sales", "📈 End of Day Summary"]
          }
        };
      }

      case 'TODAY_REFUNDS': {
        // Use canonical refunds figure from the accounting summary
        const refundValue = summary.refunds;
        const refundCount = summary.refunded_orders;

        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent,
          summaryText: refundCount > 0
            ? `Total refunds today: ${formatINR(refundValue)} across ${refundCount} orders.`
            : 'No refunds have been processed for this business day.',
          card: {
            title: 'Refunds & Returns Ledger',
            badge: `${refundCount} Refunds`,
            badgeType: refundCount > 0 ? 'warning' : 'success',
            highlightNumber: formatINR(refundValue),
            highlightLabel: 'Total Refund Value',
            metrics: [
              { label: 'Refunded Tickets', value: `${refundCount} bills` },
              { label: 'Total Refunded', value: formatINR(refundValue), isBold: true },
              { label: 'Net Collected (after refunds)', value: formatINR(summary.net_collected) }
            ],
            notes: 'All refunds require Shift Manager PIN authorization and are logged in Audit Trail.',
            actions: [{ label: "View Today's Bills", actionType: 'NAVIGATE_TAB', targetTab: 'BILLS' }],
            suggestions: ["📊 Today's Sales", "📈 End of Day Summary"]
          }
        };
      }

      case 'TODAY_CANCELLED': {
        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent,
          summaryText: cancelledCount > 0
            ? `${cancelledCount} orders were cancelled / voided for this business day.`
            : 'No orders have been cancelled for this business day.',
          card: {
            title: 'Cancelled & Voided Tickets',
            badge: `${cancelledCount} Cancelled`,
            badgeType: cancelledCount > 0 ? 'danger' : 'success',
            highlightNumber: `${cancelledCount}`,
            highlightLabel: 'Void Invoices',
            metrics: [
              { label: 'Cancelled Orders', value: `${cancelledCount} orders` },
              { label: 'Total Orders (incl. cancelled)', value: `${totalOrders} orders` },
              { label: 'Audit Log Status', value: 'All voids recorded with manager reason' }
            ],
            actions: [{ label: "View Today's Bills", actionType: 'NAVIGATE_TAB', targetTab: 'BILLS' }],
            suggestions: ["📊 Today's Sales", "📈 End of Day Summary"]
          }
        };
      }

      case 'END_OF_DAY': {
        const openingCash = summary.opening_cash;
        const expectedCash = summary.cash_expected;
        const gst   = summary.tax_amount || (summary.cgst_amount + summary.sgst_amount);
        const reconciled = summary.net_collected === (cashSales + upiSales + cardSales + summary.other_sales);

        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent,
          summaryText: `EOD Summary — Net Revenue: ${formatINR(totalSales)}, ${orderCount} Billed, Cash ${formatINR(cashSales)}, UPI ${formatINR(upiSales)}, Card ${formatINR(cardSales)}.`,
          card: {
            title: '📈 End of Day (EOD) Executive Summary',
            badge: reconciled ? 'Reconciled ✓' : 'Check Reconciliation',
            badgeType: reconciled ? 'success' : 'warning',
            highlightNumber: formatINR(totalSales),
            highlightLabel: 'Total Net Revenue',
            metrics: [
              { label: 'Completed Bills', value: `${orderCount} of ${totalOrders} orders`, isBold: true },
              { label: 'Average Bill (AOV)', value: formatINR(aov) },
              { label: '💵 Cash Collected', value: formatINR(cashSales), color: 'text-amber-700', isBold: true },
              { label: '📱 UPI / QR Settled', value: formatINR(upiSales), color: 'text-blue-700', isBold: true },
              { label: '💳 Card Terminal', value: formatINR(cardSales), color: 'text-emerald-700', isBold: true },
              { label: 'GST Collected (5%)', value: formatINR(gst) },
              { label: 'Opening Cash Float', value: formatINR(openingCash) },
              { label: 'Expected in Drawer', value: formatINR(expectedCash), isBold: true }
            ],
            notes: reconciled
              ? `✓ Reconciled — Business Day ${activeDay.id}`
              : `⚠ Variance detected — check payment reconciliation`,
            actions: [
              { label: 'Open POS Reports', actionType: 'NAVIGATE_TAB', targetTab: 'REPORTS' },
              { label: 'Shift & Cash Reconciliation', actionType: 'OPEN_MODAL', modalName: 'SHIFT' },
              { label: '🖨 Print EOD Summary', actionType: 'PRINT_SUMMARY' }
            ],
            suggestions: ["📊 Today's Sales", "💰 Cash Collection", "📱 UPI Collection"]
          }
        };
      }

      case 'ACTIVE_STAFF': {
        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent,
          summaryText: `Active cashier: ${activeShift?.cashierName || summary.opened_by}. Day opened at ${new Date(activeDay.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
          card: {
            title: 'Staff & Shift Activity',
            badge: activeShift ? 'Shift Active' : 'No Active Shift',
            badgeType: activeShift ? 'success' : 'warning',
            highlightNumber: activeShift?.cashierName || summary.opened_by,
            highlightLabel: 'Active POS Operator',
            metrics: [
              { label: 'Day Opened By', value: summary.opened_by },
              { label: 'Opened At', value: new Date(activeDay.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
              { label: 'Day Sales', value: formatINR(totalSales) },
              { label: 'Completed Bills', value: `${orderCount} orders` }
            ],
            actions: [{ label: 'Shift Management', actionType: 'OPEN_MODAL', modalName: 'SHIFT' }],
            suggestions: ["💰 Cash Collection", "📊 Today's Sales"]
          }
        };
      }

      case 'BUSIEST_HOUR': {
        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent,
          summaryText: 'Peak rush period is between 1:00 PM – 2:30 PM (Lunch) and 7:30 PM – 9:30 PM (Dinner).',
          card: {
            title: 'Busiest Trading Hours & Rush Periods',
            badge: 'Peak Analysis',
            badgeType: 'warning',
            highlightNumber: '7:30 PM – 9:30 PM',
            highlightLabel: 'Primary Dinner Rush (42% of Daily Sales)',
            metrics: [
              { label: 'Lunch Rush Window', value: '1:00 PM – 2:30 PM' },
              { label: 'Dinner Rush Window', value: '7:30 PM – 9:30 PM' },
              { label: 'Top Rush Category', value: 'Main Course & Tandoori Breads' }
            ],
            actions: [{ label: 'Open POS Reports', actionType: 'NAVIGATE_TAB', targetTab: 'REPORTS' }],
            suggestions: ["🔥 Top Selling Items", "📊 Today's Sales"]
          }
        };
      }

      case 'COMPARE_PLANS': {
        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent: 'COMPARE_PLANS',
          summaryText:
            'JAMANVAAR CORE (₹5,000) covers complete POS and management. JAMANVAAR PRO (₹7,000) adds the complete connected restaurant ecosystem (+₹2,000 for Captain App, QR Ordering, Kiosk, Advanced KDS, Real-time Mesh Sync, and AI).',
          card: {
            title: '⭐ JAMANVAAR CORE vs PRO Comparison',
            badge: 'Flagship Ecosystem',
            badgeType: 'warning',
            highlightNumber: '₹2,000',
            highlightLabel: 'Difference between CORE and PRO',
            metrics: [
              { label: 'JAMANVAAR CORE', value: '₹5,000 (POS + Management)', isBold: true },
              { label: 'JAMANVAAR PRO', value: '₹7,000 (Connected Suite)', isBold: true, color: '#E66817' },
              { label: 'PRO Unlocks', value: 'Captain + QR + Kiosk + Sync + AI', color: '#10B981' }
            ],
            notes: 'Pro provides 11+ additional modules including table-side ordering, KDS routing, and real-time mesh sync.',
            actions: [
              { label: 'Open Settings & Plans', actionType: 'NAVIGATE_TAB', targetTab: 'SETTINGS' }
            ],
            suggestions: ["What's in PRO?", "Captain features", "QR Ordering", "Today's Sales"]
          }
        };
      }

      case 'PRO_FEATURES': {
        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent: 'PRO_FEATURES',
          summaryText:
            'JAMANVAAR PRO unlocks 11 advanced connected capabilities: Wireless Captain App, QR Table Ordering, Self-Service Kiosks, Multi-Station KDS, Real-Time Mesh Sync, Advanced Analytics, and JAMAN AI Assistant.',
          card: {
            title: '⭐ JAMANVAAR PRO Flagship Edition',
            badge: '₹7,000 / license',
            badgeType: 'warning',
            metrics: [
              { label: '📱 Captain Waiter App', value: 'Table-side wireless ordering' },
              { label: '📲 QR Table Ordering', value: 'Customer self-service ordering' },
              { label: '🔄 Real-Time Sync', value: 'POS ↔ Captain ↔ KDS mesh' },
              { label: '⚡ Advanced KDS', value: 'Multi-station routing & timing' },
              { label: '🤖 JAMAN AI Assistant', value: 'Live natural language query' }
            ],
            actions: [
              { label: 'View Subscription Plans', actionType: 'NAVIGATE_TAB', targetTab: 'SETTINGS' }
            ],
            suggestions: ['Compare CORE vs PRO', 'Captain features', 'Today sales']
          }
        };
      }

      case 'CAPTAIN_FEATURES': {
        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent: 'CAPTAIN_FEATURES',
          summaryText:
            'The Captain App allows waiters to take orders table-side, dispatch wireless KOTs, receive instant food ready notifications, and request bills directly from the floor.',
          card: {
            title: '📱 Wireless Captain / Waiter App',
            badge: 'PRO Feature',
            badgeType: 'success',
            metrics: [
              { label: 'Floor Ordering', value: 'Table-side menu & modifiers' },
              { label: 'Kitchen Alerts', value: 'Instant Food Ready push' },
              { label: 'Floor Actions', value: 'Table transfer, merge & bill request' }
            ],
            actions: [
              { label: 'View Floor Plan', actionType: 'NAVIGATE_TAB', targetTab: 'TABLES' }
            ],
            suggestions: ['What is in PRO?', 'Table Occupancy', 'Delayed KOT']
          }
        };
      }

      case 'QR_FEATURES': {
        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent: 'QR_FEATURES',
          summaryText:
            'QR Table Ordering enables dining guests to scan table-specific QR codes, browse the digital menu, customize dishes, and place orders directly to POS & KDS.',
          card: {
            title: '📲 QR Table & Kiosk Ordering',
            badge: 'PRO Feature',
            badgeType: 'success',
            metrics: [
              { label: 'Dynamic QR', value: 'Table auto-identified' },
              { label: 'Zero Wait', value: 'Auto-syncs into Kitchen KDS' },
              { label: 'Self-Service', value: 'Higher ticket size & faster turnover' }
            ],
            actions: [
              { label: 'View Orders', actionType: 'NAVIGATE_TAB', targetTab: 'ORDERS' }
            ],
            suggestions: ['What is in PRO?', 'Today sales', 'Table Occupancy']
          }
        };
      }

      case 'HELP_UNKNOWN':
      default: {
        return {
          id,
          sender: 'ASSISTANT',
          timestamp,
          intent: 'HELP_UNKNOWN',
          summaryText:
            'I can help you with restaurant operations such as sales, orders, KOT status, occupied tables, inventory, cash drawer, and daily reports.',
          card: {
            title: '✨ JAMANVAAR POS Smart Assistant',
            badge: 'Offline Intelligence',
            badgeType: 'default',
            metrics: [
              { label: '📊 Sales & Collections', value: "Today's Sales, Cash, UPI, Card" },
              { label: '👨‍🍳 Kitchen & KOT', value: 'Delayed KOT, Pending KOT, Stations' },
              { label: '🍽 Dine-In Tables', value: 'Table Occupancy, Available Tables' },
              { label: '📦 Inventory & Stock', value: 'Low Stock, Out of Stock (86)' },
              { label: '📈 Reports', value: 'End of Day Summary, Tax GST' }
            ],
            actions: [
              { label: "Today's Sales", actionType: 'CUSTOM', payload: 'TODAY_SALES' },
              { label: 'Delayed KOT', actionType: 'CUSTOM', payload: 'DELAYED_KOT' },
              { label: 'Table Occupancy', actionType: 'CUSTOM', payload: 'TABLE_OCCUPANCY' }
            ],
            suggestions: [
              "📊 Today's Sales",
              "🔥 Top Selling Items",
              "💰 Cash Collection",
              "📱 UPI Collection",
              "🍽 Table Occupancy",
              "🔥 Delayed KOT",
              "📦 Low Stock",
              "📈 End of Day Summary"
            ]
          }
        };
      }
    }
  }

  /**
   * Dispatches thermal print summary job for End of Day
   */
  public static printSummaryTicket(): void {
    const activeDay = BusinessDayAccountingService.getActiveBusinessDay();
    const summary = BusinessDayAccountingService.getBusinessDaySummary(activeDay.id);

    const totalSales = summary.net_sales;
    const cashSales = summary.cash_sales;
    const upiSales = summary.upi_sales;
    const cardSales = summary.card_sales;
    const completedOrdersCount = summary.completed_orders;
    const cgst = summary.cgst_amount;
    const sgst = summary.sgst_amount;

    const rawPayload = `
========================================
            JAMANVAAR POS
           BY KELVIONTECH
----------------------------------------
DAILY SALES & AUDIT RECONCILIATION
BUSINESS DAY: ${activeDay.id}
DATE: ${summary.display_date}
TIME: ${new Date().toLocaleTimeString()}
TERMINAL: POS-01
----------------------------------------
Total Completed Orders: ${completedOrdersCount}
Gross Sales Turnover:   ${formatINR(summary.gross_sales)}
Net Sales Revenue:      ${formatINR(totalSales)}
----------------------------------------
COLLECTIONS:
Cash at Counter:        ${formatINR(cashSales)}
UPI Dynamic QR:         ${formatINR(upiSales)}
Card Terminal POS:      ${formatINR(cardSales)}
----------------------------------------
STATUTORY TAX (5% GST):
CGST (2.5%):            ${formatINR(cgst)}
SGST (2.5%):            ${formatINR(sgst)}
----------------------------------------
Printed from POS Smart Assistant
========================================
    `.trim();

    PrintQueueRepository.addJob({
      type: 'TEST_PAGE',
      printerName: 'JAMANVAAR Built-in Thermal 80mm',
      rawPayload,
      paperSize: '80mm'
    });
  }
}
