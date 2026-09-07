import {
  db,
  ShiftRepository,
  BusinessDayRepository,
  BusinessDayAccountingService
} from '@jamanvaar/database';
import { PosAssistantResponse } from './pos_assistant';

export interface DynamicQueryFormula {
  targetDomain: 'ORDERS' | 'PAYMENTS' | 'KITCHEN' | 'TABLES' | 'INVENTORY' | 'SHIFTS';
  calculationType: 'SUM' | 'COUNT' | 'AVG' | 'RATIO' | 'TOP_LIST';
  filterField?: string;
  filterValue?: string;
  secondaryFilterField?: string;
  secondaryFilterValue?: string;
  displayUnit?: 'CURRENCY' | 'NUMBER' | 'PERCENT' | 'MINUTES';
}

export class DynamicQueryExecutor {
  /**
   * Execute dynamic query formula against the local edge database
   */
  public static execute(
    label: string,
    formula: DynamicQueryFormula,
    _iconName: string = 'sparkles'
  ): PosAssistantResponse {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const id = `dyn-resp-${Date.now()}`;

    const activeDay = BusinessDayAccountingService.getActiveBusinessDay();
    const summary = BusinessDayAccountingService.getBusinessDaySummary(activeDay.id);
    const todayOrders = BusinessDayRepository.getOrdersForBusinessDay(activeDay.id);
    const allOrders = todayOrders.length > 0 ? todayOrders : db.orders || [];

    switch (formula.targetDomain) {
      case 'ORDERS':
        return this.evaluateOrders(label, formula, allOrders, summary, timestamp, id);

      case 'PAYMENTS':
        return this.evaluatePayments(label, formula, summary, allOrders, timestamp, id);

      case 'KITCHEN':
        return this.evaluateKitchen(label, formula, timestamp, id);

      case 'TABLES':
        return this.evaluateTables(label, formula, timestamp, id);

      case 'INVENTORY':
        return this.evaluateInventory(label, formula, timestamp, id);

      case 'SHIFTS':
        return this.evaluateShifts(label, formula, summary, timestamp, id);

      default:
        return {
          id,
          intent: 'HELP_UNKNOWN',
          sender: 'ASSISTANT',
          timestamp,
          summaryText: `Formula evaluation for ${label} completed on local restaurant ledger.`,
          card: {
            title: label,
            badge: 'LOCAL REAL DATA',
            badgeType: 'success',
            highlightNumber: `₹${summary.net_sales.toLocaleString('en-IN')}`,
            metrics: [
              { label: 'Total Billed', value: `₹${summary.net_sales.toLocaleString('en-IN')}`, color: 'text-emerald-700' },
              { label: 'Orders', value: `${summary.completed_orders}` }
            ],
            actions: [
              { label: 'View Reports', actionType: 'NAVIGATE_TAB', targetTab: 'REPORTS' }
            ],
            suggestions: ["Today's Total Orders", "Delayed KOTs"]
          }
        };
    }
  }

  private static evaluateOrders(
    label: string,
    formula: DynamicQueryFormula,
    allOrders: any[],
    summary: any,
    timestamp: string,
    id: string
  ): PosAssistantResponse {
    let filtered = [...allOrders];

    if (formula.filterField && formula.filterValue) {
      const field = formula.filterField.toLowerCase();
      const val = formula.filterValue.toUpperCase();

      if (field === 'channel' || field === 'ordertype') {
        filtered = filtered.filter((o) => {
          const type = (o.orderType || '').toUpperCase();
          const partner = (o.deliveryPartner || o.source || '').toUpperCase();
          return type === val || partner === val || (o.channel || '').toUpperCase() === val;
        });
      } else if (field === 'status' || field === 'orderstatus') {
        filtered = filtered.filter((o) => (o.orderStatus || '').toUpperCase() === val);
      }
    }

    const count = filtered.length;
    const totalRevenue = filtered.reduce((acc, o) => acc + (o.netAmount || o.totalAmount || 0), 0);
    const avgTicket = count > 0 ? Math.round(totalRevenue / count) : 0;

    let highlight = '';
    if (formula.calculationType === 'COUNT') {
      highlight = `${count} Orders`;
    } else if (formula.calculationType === 'AVG') {
      highlight = `₹${avgTicket.toLocaleString('en-IN')}`;
    } else if (formula.calculationType === 'RATIO') {
      const pct = summary.total_orders > 0 ? Math.round((count / summary.total_orders) * 100) : 0;
      highlight = `${pct}% Share`;
    } else {
      highlight = `₹${totalRevenue.toLocaleString('en-IN')}`;
    }

    return {
      id,
      intent: 'DYNAMIC_QUERY' as any,
      sender: 'ASSISTANT',
      timestamp,
      summaryText: `${label}: Computed from ${count} matching orders in today's active business ledger.`,
      card: {
        title: label,
        badge: `${formula.filterValue || 'ORDERS'} • LIVE`,
        badgeType: 'default',
        highlightNumber: highlight,
        metrics: [
          { label: 'Volume', value: `${count} Orders` },
          { label: 'Total Revenue', value: `₹${totalRevenue.toLocaleString('en-IN')}`, color: 'text-emerald-700' },
          { label: 'Avg Ticket', value: `₹${avgTicket.toLocaleString('en-IN')}` },
          { label: 'Day Total', value: `₹${summary.net_sales.toLocaleString('en-IN')}` }
        ],
        actions: [
          { label: 'Open Orders Pipeline', actionType: 'NAVIGATE_TAB', targetTab: 'ORDERS' }
        ],
        suggestions: ["Swiggy Delivery Orders", "Zomato Delivery Orders", "Today's Gross Sales"]
      }
    };
  }

  private static evaluatePayments(
    label: string,
    formula: DynamicQueryFormula,
    summary: any,
    _allOrders: any[],
    timestamp: string,
    id: string
  ): PosAssistantResponse {
    const val = (formula.filterValue || '').toUpperCase();
    let collectedAmount = 0;
    let methodLabel = 'All Collections';

    if (val === 'CASH') {
      collectedAmount = summary.cash_sales;
      methodLabel = 'Cash Drawer Collections';
    } else if (val === 'UPI' || val === 'QR') {
      collectedAmount = summary.upi_sales;
      methodLabel = 'UPI & QR Collections';
    } else if (val === 'CARD') {
      collectedAmount = summary.card_sales;
      methodLabel = 'Card Terminal Collections';
    } else {
      collectedAmount = summary.net_sales;
    }

    const sharePct = summary.net_sales > 0 ? Math.round((collectedAmount / summary.net_sales) * 100) : 0;

    let highlight = `₹${collectedAmount.toLocaleString('en-IN')}`;
    if (formula.calculationType === 'RATIO') {
      highlight = `${sharePct}% of Total`;
    }

    return {
      id,
      intent: 'DYNAMIC_QUERY' as any,
      sender: 'ASSISTANT',
      timestamp,
      summaryText: `${methodLabel} stands at ₹${collectedAmount.toLocaleString('en-IN')}, representing ${sharePct}% of total net sales today.`,
      card: {
        title: label,
        badge: 'PAYMENT AUDIT • LIVE',
        badgeType: 'success',
        highlightNumber: highlight,
        metrics: [
          { label: 'Tender Amount', value: `₹${collectedAmount.toLocaleString('en-IN')}`, color: 'text-emerald-700' },
          { label: 'Tender Share', value: `${sharePct}%` },
          { label: 'Total Net Sales', value: `₹${summary.net_sales.toLocaleString('en-IN')}` }
        ],
        actions: [
          { label: 'View Bills & Settlements', actionType: 'NAVIGATE_TAB', targetTab: 'BILLS' }
        ],
        suggestions: ["UPI QR Collections", "Cash in Drawer & Float"]
      }
    };
  }

  private static evaluateKitchen(
    label: string,
    formula: DynamicQueryFormula,
    timestamp: string,
    id: string
  ): PosAssistantResponse {
    const kots = db.kots || [];
    const pendingKots = kots.filter((k) => k.status === 'PENDING' || k.status === 'PREPARING');
    const now = Date.now();
    const delayedThresholdMin = 15;

    const delayed = pendingKots.filter((k) => {
      const created = new Date(k.createdAt).getTime();
      return (now - created) / 60000 > delayedThresholdMin;
    });

    const count = formula.filterValue === 'DELAYED' ? delayed.length : pendingKots.length;
    const highlight = formula.filterValue === 'DELAYED' ? `${delayed.length} Delayed` : `${pendingKots.length} Active Tickets`;

    return {
      id,
      intent: 'DYNAMIC_QUERY' as any,
      sender: 'ASSISTANT',
      timestamp,
      summaryText: `Kitchen has ${pendingKots.length} active tickets, of which ${delayed.length} have exceeded ${delayedThresholdMin} minutes prep time.`,
      card: {
        title: label,
        badge: delayed.length > 0 ? 'ALERT • KITCHEN DELAY' : 'NORMAL KITCHEN LOAD',
        badgeType: delayed.length > 0 ? 'warning' : 'success',
        highlightNumber: highlight,
        metrics: [
          { label: 'Delayed (>15m)', value: `${delayed.length}`, color: delayed.length > 0 ? 'text-rose-600' : 'text-emerald-600' },
          { label: 'Active Queue', value: `${pendingKots.length}` },
          { label: 'Total KOTs Today', value: `${kots.length}` }
        ],
        actions: [
          { label: 'Open Kitchen Display (KDS)', actionType: 'NAVIGATE_TAB', targetTab: 'KOT' }
        ],
        suggestions: ["Kitchen Station Turnaround", "Active Live KOT Queue"]
      }
    };
  }

  private static evaluateTables(
    label: string,
    formula: DynamicQueryFormula,
    timestamp: string,
    id: string
  ): PosAssistantResponse {
    const tables = db.tables || [];
    const occupied = tables.filter((t) => t.status === 'OCCUPIED' || t.status === 'BILLING');
    const available = tables.filter((t) => t.status === 'AVAILABLE');
    const reserved = tables.filter((t) => t.status === 'RESERVED');
    const occupancyRate = tables.length > 0 ? Math.round((occupied.length / tables.length) * 100) : 0;

    let highlight = `${occupancyRate}% Occupied`;
    if (formula.filterValue === 'AVAILABLE') {
      highlight = `${available.length} Free Tables`;
    }

    return {
      id,
      intent: 'DYNAMIC_QUERY' as any,
      sender: 'ASSISTANT',
      timestamp,
      summaryText: `Dining floor is ${occupancyRate}% full with ${occupied.length} active tables and ${available.length} ready tables.`,
      card: {
        title: label,
        badge: 'FLOOR UTILIZATION',
        badgeType: 'default',
        highlightNumber: highlight,
        metrics: [
          { label: 'Occupancy Rate', value: `${occupancyRate}%`, color: 'text-indigo-700' },
          { label: 'Seated Tables', value: `${occupied.length}` },
          { label: 'Clean & Ready', value: `${available.length}`, color: 'text-emerald-600' },
          { label: 'Reserved', value: `${reserved.length}` }
        ],
        actions: [
          { label: 'View Floor Plan', actionType: 'NAVIGATE_TAB', targetTab: 'TABLES' }
        ],
        suggestions: ["Available Clean Tables", "Dining Floor Occupancy %"]
      }
    };
  }

  private static evaluateInventory(
    label: string,
    formula: DynamicQueryFormula,
    timestamp: string,
    id: string
  ): PosAssistantResponse {
    const inventory = db.inventoryItems || [];
    const lowStock = inventory.filter((item) => {
      const threshold = item.reorderLevel || 5;
      return item.currentStock <= threshold && item.currentStock > 0;
    });
    const outOfStock = inventory.filter((item) => item.currentStock <= 0);

    const count = formula.filterValue === 'OUT_OF_STOCK' ? outOfStock.length : lowStock.length;
    const highlight = formula.filterValue === 'OUT_OF_STOCK' ? `${outOfStock.length} Items 86'd` : `${lowStock.length} Low Stock SKUs`;

    return {
      id,
      intent: 'DYNAMIC_QUERY' as any,
      sender: 'ASSISTANT',
      timestamp,
      summaryText: `Inventory audit flagged ${lowStock.length} ingredients below safe buffer and ${outOfStock.length} items completely depleted.`,
      card: {
        title: label,
        badge: count > 0 ? 'ATTENTION REQUIRED' : 'STOCK HEALTHY',
        badgeType: count > 0 ? 'warning' : 'success',
        highlightNumber: highlight,
        metrics: [
          { label: 'Critical Buffer', value: `${lowStock.length}`, color: 'text-amber-600' },
          { label: 'Out of Stock (86)', value: `${outOfStock.length}`, color: 'text-rose-600' },
          { label: 'Total Tracked', value: `${inventory.length}` }
        ],
        actions: [
          { label: 'Manage Inventory', actionType: 'NAVIGATE_TAB', targetTab: 'SETTINGS' }
        ],
        suggestions: ["Critical Low Stock Ingredients", "Out of Stock Dishes (86 List)"]
      }
    };
  }

  private static evaluateShifts(
    label: string,
    _formula: DynamicQueryFormula,
    summary: any,
    timestamp: string,
    id: string
  ): PosAssistantResponse {
    const activeShift = ShiftRepository.getActiveShift();
    const startingCash = activeShift?.openingCash || 0;
    const cashSales = summary.cash_sales || 0;
    const expectedDrawer = startingCash + cashSales;

    return {
      id,
      intent: 'DYNAMIC_QUERY' as any,
      sender: 'ASSISTANT',
      timestamp,
      summaryText: `Active shift cashier cash drawer expected balance is ₹${expectedDrawer.toLocaleString('en-IN')}.`,
      card: {
        title: label,
        badge: 'SHIFT AUDIT • VERIFIED',
        badgeType: 'success',
        highlightNumber: `₹${expectedDrawer.toLocaleString('en-IN')}`,
        metrics: [
          { label: 'Float In', value: `₹${startingCash.toLocaleString('en-IN')}` },
          { label: 'Cash Sales', value: `₹${cashSales.toLocaleString('en-IN')}`, color: 'text-emerald-700' },
          { label: 'Drawer Expected', value: `₹${expectedDrawer.toLocaleString('en-IN')}`, color: 'text-indigo-700' }
        ],
        actions: [
          { label: 'Open Shift Settings', actionType: 'NAVIGATE_TAB', targetTab: 'SETTINGS' }
        ],
        suggestions: ["Cash in Drawer & Float", "Today's Gross Sales"]
      }
    };
  }
}
