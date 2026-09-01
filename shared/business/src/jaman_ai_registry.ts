import { db, ShiftRepository } from '@jamanvaar/database';
import { BusinessDayService } from './business_day_service';
import { PosAssistantIntent } from './pos_assistant';

export type JamanAiCategory =
  | 'TODAY'
  | 'SALES'
  | 'PAYMENTS'
  | 'ORDERS'
  | 'KITCHEN'
  | 'TABLES'
  | 'MENU'
  | 'INVENTORY'
  | 'CUSTOMERS'
  | 'STAFF'
  | 'INSIGHTS';

export interface JamanAiQuestion {
  id: string;
  category: JamanAiCategory;
  label: string;
  icon: string; // lucide icon identifier
  intent: PosAssistantIntent | string;
  roles: ('CASHIER' | 'MANAGER' | 'OWNER_ADMIN' | 'ALL')[];
  apps: ('POS' | 'ADMIN' | 'ALL')[];
  isCriticalAlert?: boolean;
  priorityScore?: number;
}

export const JAMAN_AI_CATEGORIES: Array<{
  id: JamanAiCategory;
  label: string;
  icon: string;
  description: string;
}> = [
  { id: 'TODAY', label: "Today's Pulse", icon: 'clock', description: "Real-time daily metrics for active business day" },
  { id: 'SALES', label: 'Sales & Finance', icon: 'trending-up', description: 'Gross revenue, AOV, tax, and sales growth' },
  { id: 'PAYMENTS', label: 'Payment Split', icon: 'credit-card', description: 'Cash drawer, UPI QR, card, and refunds' },
  { id: 'ORDERS', label: 'Order Pipeline', icon: 'shopping-bag', description: 'Active, completed, dine-in, takeaway & delivery' },
  { id: 'KITCHEN', label: 'Kitchen & KOT', icon: 'chef-hat', description: 'Delayed tickets, queue times, and station loads' },
  { id: 'TABLES', label: 'Dining Tables', icon: 'layout-grid', description: 'Occupancy rate, vacant tables, and billing requests' },
  { id: 'MENU', label: 'Menu Analytics', icon: 'utensils', description: 'Top dishes, fast movers, and category revenue' },
  { id: 'INVENTORY', label: 'Stock & Inventory', icon: 'package', description: 'Low stock alerts, out-of-stock items, and consumption' },
  { id: 'CUSTOMERS', label: 'Customer CRM', icon: 'users', description: 'Total diners, repeat visit rate, and top spenders' },
  { id: 'STAFF', label: 'Staff & Shift', icon: 'user-check', description: 'Cashier sales, captain orders, and active shift variance' },
  { id: 'INSIGHTS', label: '✨ Business Insights', icon: 'sparkles', description: 'Smart operational recommendations & opportunities' }
];

export const JAMAN_AI_QUESTION_REGISTRY: JamanAiQuestion[] = [
  // ==========================================
  // TODAY'S PULSE
  // ==========================================
  {
    id: 'today_sales',
    category: 'TODAY',
    label: "Today's Gross Sales",
    icon: 'trending-up',
    intent: 'TODAY_SALES',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 100
  },
  {
    id: 'today_orders',
    category: 'TODAY',
    label: "Today's Total Orders",
    icon: 'shopping-bag',
    intent: 'TODAY_ORDERS',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 90
  },
  {
    id: 'today_aov',
    category: 'TODAY',
    label: "Average Order Value (AOV)",
    icon: 'bar-chart-3',
    intent: 'AOV',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 80
  },
  {
    id: 'today_cash_drawer',
    category: 'TODAY',
    label: "Cash in Drawer & Float",
    icon: 'coins',
    intent: 'CASH_COLLECTION',
    roles: ['CASHIER', 'MANAGER', 'OWNER_ADMIN', 'ALL'],
    apps: ['ALL'],
    priorityScore: 85
  },
  {
    id: 'today_upi',
    category: 'TODAY',
    label: "UPI QR Collections",
    icon: 'smartphone',
    intent: 'UPI_COLLECTION',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 75
  },
  {
    id: 'today_discounts',
    category: 'TODAY',
    label: "Discounts & Offers Given",
    icon: 'tag',
    intent: 'TODAY_DISCOUNTS',
    roles: ['MANAGER', 'OWNER_ADMIN', 'ALL'],
    apps: ['ALL'],
    priorityScore: 60
  },
  {
    id: 'today_gst',
    category: 'TODAY',
    label: "Today's GST Tax Breakdown",
    icon: 'receipt',
    intent: 'TAX_SUMMARY',
    roles: ['MANAGER', 'OWNER_ADMIN', 'ALL'],
    apps: ['ALL'],
    priorityScore: 50
  },
  {
    id: 'today_refunds',
    category: 'TODAY',
    label: "Today's Refunds & Voids",
    icon: 'rotate-ccw',
    intent: 'TODAY_REFUNDS',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 65
  },

  // ==========================================
  // SALES & FINANCE
  // ==========================================
  {
    id: 'sales_growth',
    category: 'SALES',
    label: "Revenue Comparison vs Yesterday",
    icon: 'trending-up',
    intent: 'TODAY_SALES',
    roles: ['MANAGER', 'OWNER_ADMIN', 'ALL'],
    apps: ['ALL'],
    priorityScore: 70
  },
  {
    id: 'sales_busiest_hour',
    category: 'SALES',
    label: "Busiest Sales Hour of the Day",
    icon: 'clock',
    intent: 'BUSIEST_HOUR',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 65
  },
  {
    id: 'sales_eod_summary',
    category: 'SALES',
    label: "End of Day (EOD) Z-Report Summary",
    icon: 'file-text',
    intent: 'END_OF_DAY',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 80
  },
  {
    id: 'sales_dinein_takeaway',
    category: 'SALES',
    label: "Dine-In vs Takeaway vs Delivery",
    icon: 'layers',
    intent: 'PAYMENT_SUMMARY',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 60
  },

  // ==========================================
  // PAYMENT CHANNELS
  // ==========================================
  {
    id: 'payment_split_all',
    category: 'PAYMENTS',
    label: "Tender Split (Cash vs UPI vs Card)",
    icon: 'credit-card',
    intent: 'PAYMENT_SUMMARY',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 75
  },
  {
    id: 'payment_card',
    category: 'PAYMENTS',
    label: "Credit / Debit Card POS Sales",
    icon: 'credit-card',
    intent: 'CARD_COLLECTION',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 60
  },

  // ==========================================
  // ORDER PIPELINE
  // ==========================================
  {
    id: 'orders_active_live',
    category: 'ORDERS',
    label: "Current In-Progress Orders",
    icon: 'flame',
    intent: 'ACTIVE_ORDERS',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 85
  },
  {
    id: 'orders_completed',
    category: 'ORDERS',
    label: "Completed & Settled Orders",
    icon: 'check-circle-2',
    intent: 'COMPLETED_ORDERS',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 70
  },
  {
    id: 'orders_cancelled',
    category: 'ORDERS',
    label: "Cancelled / Voided Order Count",
    icon: 'alert-circle',
    intent: 'TODAY_CANCELLED',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 65
  },

  // ==========================================
  // KITCHEN & KOT
  // ==========================================
  {
    id: 'kitchen_delayed_kot',
    category: 'KITCHEN',
    label: "Delayed KOTs (> 15 mins)",
    icon: 'flame',
    intent: 'DELAYED_KOT',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 95
  },
  {
    id: 'kitchen_pending_queue',
    category: 'KITCHEN',
    label: "Active Kitchen Queue & KOTs",
    icon: 'chef-hat',
    intent: 'PENDING_KOT',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 85
  },
  {
    id: 'kitchen_performance',
    category: 'KITCHEN',
    label: "Kitchen Station Turnaround Times",
    icon: 'timer',
    intent: 'KITCHEN_PERFORMANCE',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 75
  },

  // ==========================================
  // DINING TABLES
  // ==========================================
  {
    id: 'tables_occupancy_rate',
    category: 'TABLES',
    label: "Floor Occupancy Percentage",
    icon: 'layout-grid',
    intent: 'TABLE_OCCUPANCY',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 90
  },
  {
    id: 'tables_available',
    category: 'TABLES',
    label: "Vacant & Available Tables",
    icon: 'check',
    intent: 'AVAILABLE_TABLES',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 80
  },
  {
    id: 'tables_occupied',
    category: 'TABLES',
    label: "Currently Seated Tables",
    icon: 'users',
    intent: 'OCCUPIED_TABLES',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 75
  },

  // ==========================================
  // MENU ANALYTICS
  // ==========================================
  {
    id: 'menu_top_items',
    category: 'MENU',
    label: "Top 5 Best-Selling Dishes",
    icon: 'award',
    intent: 'TOP_ITEMS',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 85
  },
  {
    id: 'menu_best_category',
    category: 'MENU',
    label: "Top Revenue Food Category",
    icon: 'utensils',
    intent: 'BEST_CATEGORY',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 75
  },
  {
    id: 'menu_least_items',
    category: 'MENU',
    label: "Slow Moving / Low Selling Dishes",
    icon: 'arrow-down',
    intent: 'LEAST_ITEMS',
    roles: ['MANAGER', 'OWNER_ADMIN', 'ALL'],
    apps: ['ALL'],
    priorityScore: 65
  },
  {
    id: 'menu_popular_combos',
    category: 'MENU',
    label: "Popular Combo Deals & Upsells",
    icon: 'sparkles',
    intent: 'POPULAR_COMBOS',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 60
  },

  // ==========================================
  // INVENTORY & STOCK
  // ==========================================
  {
    id: 'inventory_low_stock',
    category: 'INVENTORY',
    label: "Low Stock Critical Ingredients",
    icon: 'alert-triangle',
    intent: 'LOW_STOCK',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 90
  },
  {
    id: 'inventory_out_of_stock',
    category: 'INVENTORY',
    label: "Out of Stock / 86'd Items",
    icon: 'package-x',
    intent: 'OUT_OF_STOCK',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 85
  },

  // ==========================================
  // STAFF & SHIFTS
  // ==========================================
  {
    id: 'staff_active_shift',
    category: 'STAFF',
    label: "Active Cashier Shift Status",
    icon: 'user-check',
    intent: 'ACTIVE_STAFF',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 80
  },
  {
    id: 'staff_cashier_sales',
    category: 'STAFF',
    label: "Sales by Cashier & Float Count",
    icon: 'coins',
    intent: 'CASH_COLLECTION',
    roles: ['MANAGER', 'OWNER_ADMIN', 'ALL'],
    apps: ['ALL'],
    priorityScore: 70
  },

  // ==========================================
  // BUSINESS INSIGHTS
  // ==========================================
  {
    id: 'insights_top_opp',
    category: 'INSIGHTS',
    label: "Today's Key Operational Opportunity",
    icon: 'sparkles',
    intent: 'PRO_FEATURES',
    roles: ['MANAGER', 'OWNER_ADMIN', 'ALL'],
    apps: ['ALL'],
    priorityScore: 85
  },
  {
    id: 'insights_dish_promote',
    category: 'INSIGHTS',
    label: "Recommended Dish to Promote Tonight",
    icon: 'utensils',
    intent: 'TOP_ITEMS',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 75
  },
  {
    id: 'insights_license_plans',
    category: 'INSIGHTS',
    label: "JAMANVAAR CORE vs PRO License Benefits",
    icon: 'award',
    intent: 'COMPARE_PLANS',
    roles: ['ALL'],
    apps: ['ALL'],
    priorityScore: 65
  }
];

export class JamanAiRegistry {
  /**
   * Get dynamic prioritized questions based on real-time operational state
   */
  public static getPrioritizedQuestions(app: 'POS' | 'ADMIN', userRole?: string): JamanAiQuestion[] {
    const kots = db.kots || [];
    const pendingKots = kots.filter((k) => k.status === 'PENDING' || k.status === 'PREPARING');
    const delayedKots = pendingKots.filter((k) => {
      const elapsedMinutes = (Date.now() - new Date(k.createdAt).getTime()) / 60000;
      return elapsedMinutes > 15;
    });

    const inventory = db.inventoryItems || [];
    const lowStockItems = inventory.filter((i) => i.currentStock <= i.reorderLevel);

    const tables = db.tables || [];
    const occupiedTables = tables.filter((t) => t.status === 'OCCUPIED' || t.status === 'BILLING');
    const occupancyRate = tables.length > 0 ? (occupiedTables.length / tables.length) * 100 : 0;

    const allQuestions = JAMAN_AI_QUESTION_REGISTRY.filter((q) => {
      if (!q.apps.includes('ALL') && !q.apps.includes(app)) return false;
      return true;
    });

    // Score and rank dynamically
    const scoredQuestions = allQuestions.map((q) => {
      let dynamicBonus = 0;
      let isCritical = false;

      // 1. Critical Delayed KOTs bonus
      if (q.intent === 'DELAYED_KOT' && delayedKots.length > 0) {
        dynamicBonus += 200;
        isCritical = true;
      }

      // 2. Low Stock Alert bonus
      if (q.intent === 'LOW_STOCK' && lowStockItems.length > 0) {
        dynamicBonus += 150;
        isCritical = true;
      }

      // 3. High Table Occupancy bonus (> 70%)
      if (q.intent === 'TABLE_OCCUPANCY' && occupancyRate > 70) {
        dynamicBonus += 100;
      }

      return {
        ...q,
        isCriticalAlert: isCritical,
        priorityScore: (q.priorityScore || 50) + dynamicBonus
      };
    });

    // Sort descending by priority
    return scoredQuestions.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
  }

  /**
   * Get questions for specific category
   */
  public static getQuestionsByCategory(
    category: JamanAiCategory,
    app: 'POS' | 'ADMIN'
  ): JamanAiQuestion[] {
    const list = this.getPrioritizedQuestions(app);
    return list.filter((q) => q.category === category);
  }
}
