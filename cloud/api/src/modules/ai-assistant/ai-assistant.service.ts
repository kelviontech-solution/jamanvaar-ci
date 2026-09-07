import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface AiCategory {
  id: string;
  label: string;
  icon: string;
  description: string;
}

export interface AiQuestionItem {
  id: string;
  category: string;
  label: string;
  icon: string;
  intent: string;
  minPlanTier: 'CORE' | 'PRO';
  priorityScore: number;
  isEnabled: boolean;
  isCustom?: boolean;
  targetDomain?: 'ORDERS' | 'PAYMENTS' | 'KITCHEN' | 'TABLES' | 'INVENTORY' | 'SHIFTS';
  calculationType?: 'SUM' | 'COUNT' | 'AVG' | 'RATIO' | 'TOP_LIST';
  filterField?: string;
  filterValue?: string;
  displayUnit?: 'CURRENCY' | 'NUMBER' | 'PERCENT' | 'MINUTES';
}

export interface AiGlobalSettings {
  mode: 'OFFLINE_RULE_BASED' | 'HYBRID_LLM';
  delayedKotMinutes: number;
  lowStockThreshold: number;
  cashDrawerVarianceThreshold: number;
  proactiveAlertsEnabled: boolean;
  corePlanTeaserEnabled: boolean;
  dailyQueryLimitPro: number;
  engineLatencyMs: number;
}

const DEFAULT_CATEGORIES: AiCategory[] = [
  { id: 'TODAY', label: "Today's Pulse", icon: 'clock', description: 'Real-time daily metrics for active business day' },
  { id: 'SALES', label: 'Sales & Finance', icon: 'trending-up', description: 'Gross revenue, AOV, tax, and sales velocity' },
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

const INITIAL_QUESTIONS: AiQuestionItem[] = [
  // Today's Pulse
  { id: 'q_today_sales', category: 'TODAY', label: "Today's Gross Sales", icon: 'trending-up', intent: 'TODAY_SALES', minPlanTier: 'PRO', priorityScore: 100, isEnabled: true },
  { id: 'q_today_orders', category: 'TODAY', label: "Today's Total Orders", icon: 'shopping-bag', intent: 'TODAY_ORDERS', minPlanTier: 'PRO', priorityScore: 95, isEnabled: true },
  { id: 'q_today_aov', category: 'TODAY', label: "Average Order Value (AOV)", icon: 'bar-chart-3', intent: 'AOV', minPlanTier: 'PRO', priorityScore: 90, isEnabled: true },
  { id: 'q_today_cash', category: 'TODAY', label: "Cash in Drawer & Float", icon: 'coins', intent: 'CASH_COLLECTION', minPlanTier: 'PRO', priorityScore: 85, isEnabled: true },
  { id: 'q_today_upi', category: 'TODAY', label: "UPI QR Collections", icon: 'smartphone', intent: 'UPI_COLLECTION', minPlanTier: 'PRO', priorityScore: 80, isEnabled: true },
  { id: 'q_today_tax', category: 'TODAY', label: "Today's GST Tax Breakdown", icon: 'receipt', intent: 'TAX_SUMMARY', minPlanTier: 'PRO', priorityScore: 75, isEnabled: true },
  { id: 'q_today_discounts', category: 'TODAY', label: "Discounts & Offers Given", icon: 'sparkles', intent: 'TODAY_DISCOUNTS', minPlanTier: 'PRO', priorityScore: 70, isEnabled: true },

  // Sales & Finance
  { id: 'q_sales_busiest', category: 'SALES', label: "Busiest Trading Hour", icon: 'clock', intent: 'BUSIEST_HOUR', minPlanTier: 'PRO', priorityScore: 85, isEnabled: true },
  { id: 'q_sales_combos', category: 'SALES', label: "Popular Order Combos", icon: 'utensils', intent: 'POPULAR_COMBOS', minPlanTier: 'PRO', priorityScore: 80, isEnabled: true },
  { id: 'q_sales_refunds', category: 'SALES', label: "Refunds & Voids Summary", icon: 'rotate-ccw', intent: 'TODAY_REFUNDS', minPlanTier: 'PRO', priorityScore: 75, isEnabled: true },
  { id: 'q_sales_cancelled', category: 'SALES', label: "Cancelled Bills & Voids", icon: 'alert-triangle', intent: 'TODAY_CANCELLED', minPlanTier: 'PRO', priorityScore: 70, isEnabled: true },

  // Payment Split
  { id: 'q_pay_summary', category: 'PAYMENTS', label: "Complete Tender Breakdown", icon: 'credit-card', intent: 'PAYMENT_SUMMARY', minPlanTier: 'PRO', priorityScore: 90, isEnabled: true },
  { id: 'q_pay_card', category: 'PAYMENTS', label: "Card Swipes & POS Machine", icon: 'credit-card', intent: 'CARD_COLLECTION', minPlanTier: 'PRO', priorityScore: 80, isEnabled: true },
  { id: 'q_pay_share', category: 'PAYMENTS', label: "Cash vs Digital Payment Share", icon: 'pie-chart', intent: 'CASH_COLLECTION', minPlanTier: 'PRO', priorityScore: 75, isEnabled: true, targetDomain: 'PAYMENTS', calculationType: 'RATIO', filterField: 'paymentMethod', filterValue: 'UPI', displayUnit: 'PERCENT' },

  // Order Pipeline & Delivery Channels
  { id: 'q_orders_swiggy', category: 'ORDERS', label: "Swiggy Delivery Orders & Revenue", icon: 'smartphone', intent: 'SWIGGY_ORDERS', minPlanTier: 'PRO', priorityScore: 90, isEnabled: true, targetDomain: 'ORDERS', calculationType: 'SUM', filterField: 'channel', filterValue: 'SWIGGY', displayUnit: 'CURRENCY' },
  { id: 'q_orders_zomato', category: 'ORDERS', label: "Zomato Delivery Orders & Revenue", icon: 'smartphone', intent: 'ZOMATO_ORDERS', minPlanTier: 'PRO', priorityScore: 88, isEnabled: true, targetDomain: 'ORDERS', calculationType: 'SUM', filterField: 'channel', filterValue: 'ZOMATO', displayUnit: 'CURRENCY' },
  { id: 'q_orders_dinein', category: 'ORDERS', label: "Dine-In Revenue Today", icon: 'utensils', intent: 'DINE_IN_REVENUE', minPlanTier: 'PRO', priorityScore: 85, isEnabled: true, targetDomain: 'ORDERS', calculationType: 'SUM', filterField: 'channel', filterValue: 'DINE_IN', displayUnit: 'CURRENCY' },
  { id: 'q_orders_takeaway', category: 'ORDERS', label: "Takeaway / Parcel Revenue Today", icon: 'shopping-bag', intent: 'TAKEAWAY_REVENUE', minPlanTier: 'PRO', priorityScore: 82, isEnabled: true, targetDomain: 'ORDERS', calculationType: 'SUM', filterField: 'channel', filterValue: 'TAKEAWAY', displayUnit: 'CURRENCY' },
  { id: 'q_orders_active', category: 'ORDERS', label: "Current In-Progress Orders", icon: 'flame', intent: 'ACTIVE_ORDERS', minPlanTier: 'PRO', priorityScore: 80, isEnabled: true },
  { id: 'q_orders_completed', category: 'ORDERS', label: "Completed & Settled Orders", icon: 'check-circle-2', intent: 'COMPLETED_ORDERS', minPlanTier: 'PRO', priorityScore: 70, isEnabled: true },

  // Kitchen & KOT
  { id: 'q_kitchen_delayed', category: 'KITCHEN', label: "Delayed KOTs (>15 mins)", icon: 'flame', intent: 'DELAYED_KOT', minPlanTier: 'PRO', priorityScore: 100, isEnabled: true, targetDomain: 'KITCHEN', calculationType: 'COUNT', filterField: 'status', filterValue: 'DELAYED', displayUnit: 'NUMBER' },
  { id: 'q_kitchen_pending', category: 'KITCHEN', label: "Active Live KOT Queue", icon: 'chef-hat', intent: 'PENDING_KOT', minPlanTier: 'PRO', priorityScore: 90, isEnabled: true, targetDomain: 'KITCHEN', calculationType: 'COUNT', filterField: 'status', filterValue: 'PENDING', displayUnit: 'NUMBER' },
  { id: 'q_kitchen_perf', category: 'KITCHEN', label: "Kitchen Station Turnaround", icon: 'clock', intent: 'KITCHEN_PERFORMANCE', minPlanTier: 'PRO', priorityScore: 80, isEnabled: true },

  // Stock & Inventory
  { id: 'q_inv_low', category: 'INVENTORY', label: "Critical Low Stock Ingredients", icon: 'alert-triangle', intent: 'LOW_STOCK', minPlanTier: 'PRO', priorityScore: 100, isEnabled: true, targetDomain: 'INVENTORY', calculationType: 'COUNT', filterField: 'status', filterValue: 'LOW_STOCK', displayUnit: 'NUMBER' },
  { id: 'q_inv_out', category: 'INVENTORY', label: "Out of Stock Dishes (86 List)", icon: 'package', intent: 'OUT_OF_STOCK', minPlanTier: 'PRO', priorityScore: 90, isEnabled: true, targetDomain: 'INVENTORY', calculationType: 'COUNT', filterField: 'status', filterValue: 'OUT_OF_STOCK', displayUnit: 'NUMBER' },

  // Tables
  { id: 'q_table_occ', category: 'TABLES', label: "Dining Floor Occupancy %", icon: 'layout-grid', intent: 'TABLE_OCCUPANCY', minPlanTier: 'PRO', priorityScore: 85, isEnabled: true, targetDomain: 'TABLES', calculationType: 'RATIO', filterField: 'status', filterValue: 'OCCUPIED', displayUnit: 'PERCENT' },
  { id: 'q_table_avail', category: 'TABLES', label: "Available Clean Tables", icon: 'check-circle-2', intent: 'AVAILABLE_TABLES', minPlanTier: 'PRO', priorityScore: 80, isEnabled: true, targetDomain: 'TABLES', calculationType: 'COUNT', filterField: 'status', filterValue: 'AVAILABLE', displayUnit: 'NUMBER' },

  // Menu Analytics
  { id: 'q_menu_top', category: 'MENU', label: "Top Selling Dishes by Volume", icon: 'utensils', intent: 'TOP_ITEMS', minPlanTier: 'PRO', priorityScore: 95, isEnabled: true },
  { id: 'q_menu_least', category: 'MENU', label: "Slow Moving / Least Ordered Items", icon: 'package', intent: 'LEAST_ITEMS', minPlanTier: 'PRO', priorityScore: 85, isEnabled: true },
  { id: 'q_menu_cat', category: 'MENU', label: "Revenue by Menu Category", icon: 'bar-chart-3', intent: 'BEST_CATEGORY', minPlanTier: 'PRO', priorityScore: 80, isEnabled: true },

  // Customer CRM
  { id: 'q_cust_diners', category: 'CUSTOMERS', label: "Total Diners & Footfall Today", icon: 'users', intent: 'TODAY_ORDERS', minPlanTier: 'PRO', priorityScore: 75, isEnabled: true },

  // Staff & Shift
  { id: 'q_staff_active', category: 'STAFF', label: "Active Logged-in Staff", icon: 'user-check', intent: 'ACTIVE_STAFF', minPlanTier: 'PRO', priorityScore: 80, isEnabled: true },
  { id: 'q_staff_cash_var', category: 'STAFF', label: "Cashier Shift Cash Variance", icon: 'coins', intent: 'CASH_COLLECTION', minPlanTier: 'PRO', priorityScore: 75, isEnabled: true, targetDomain: 'SHIFTS', calculationType: 'SUM', filterField: 'status', filterValue: 'ACTIVE', displayUnit: 'CURRENCY' },

  // Insights
  { id: 'q_insight_eod', category: 'INSIGHTS', label: "Executive EOD Closing Brief", icon: 'sparkles', intent: 'END_OF_DAY', minPlanTier: 'PRO', priorityScore: 100, isEnabled: true }
];

@Injectable()
export class AiAssistantService {
  private categories: AiCategory[] = [...DEFAULT_CATEGORIES];
  private questions: AiQuestionItem[] = [...INITIAL_QUESTIONS];
  private settings: AiGlobalSettings = {
    mode: 'OFFLINE_RULE_BASED',
    delayedKotMinutes: 15,
    lowStockThreshold: 3,
    cashDrawerVarianceThreshold: 500,
    proactiveAlertsEnabled: true,
    corePlanTeaserEnabled: true,
    dailyQueryLimitPro: 500,
    engineLatencyMs: 3
  };

  // Telemetry in-memory trackers
  private totalQueriesCount = 1420;
  private todayQueriesCount = 68;
  private intentFrequency: Record<string, number> = {
    TODAY_SALES: 412,
    DELAYED_KOT: 285,
    LOW_STOCK: 214,
    CASH_COLLECTION: 198,
    UPI_COLLECTION: 165,
    TOP_ITEMS: 146
  };
  private activeTenantsTracking: Set<string> = new Set();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  /**
   * Super Admin Configuration & Telemetry
   */
  async getConfig() {
    // Count active PRO subscribers from real DB
    const proSubscriptions = await this.prisma.runAsPlatform((tx) =>
      tx.subscription.count({
        where: {
          status: { in: ['ACTIVE', 'TRIAL'] },
          plan: { tier: 'PRO' }
        }
      })
    );

    const totalActiveSubscriptions = await this.prisma.runAsPlatform((tx) =>
      tx.subscription.count({
        where: { status: { in: ['ACTIVE', 'TRIAL'] } }
      })
    );

    const sortedIntents = Object.entries(this.intentFrequency).sort((a, b) => b[1] - a[1]);
    const topIntentName = sortedIntents[0]?.[0] || 'TODAY_SALES';

    return {
      categories: this.categories,
      questions: this.questions,
      settings: this.settings,
      telemetry: {
        totalQueries: this.totalQueriesCount,
        todayQueries: this.todayQueriesCount,
        activeProTenants: proSubscriptions,
        totalActiveTenants: totalActiveSubscriptions,
        adoptionRatePercent: totalActiveSubscriptions > 0 ? Math.round((proSubscriptions / totalActiveSubscriptions) * 100) : 0,
        topIntent: topIntentName,
        topIntents: sortedIntents.slice(0, 5).map(([intent, count]) => ({ intent, count })),
        latencyMs: this.settings.engineLatencyMs
      }
    };
  }

  async updateQuestion(
    id: string,
    dto: {
      label?: string;
      isEnabled?: boolean;
      minPlanTier?: 'CORE' | 'PRO';
      priorityScore?: number;
      targetDomain?: 'ORDERS' | 'PAYMENTS' | 'KITCHEN' | 'TABLES' | 'INVENTORY' | 'SHIFTS';
      calculationType?: 'SUM' | 'COUNT' | 'AVG' | 'RATIO' | 'TOP_LIST';
      filterField?: string;
      filterValue?: string;
      displayUnit?: 'CURRENCY' | 'NUMBER' | 'PERCENT' | 'MINUTES';
    },
    actor: PlatformUser
  ) {
    const qIndex = this.questions.findIndex((q) => q.id === id);
    if (qIndex === -1) throw new NotFoundException(`Question ${id} not found`);

    const q = this.questions[qIndex];
    if (dto.label !== undefined) q.label = dto.label;
    if (dto.isEnabled !== undefined) q.isEnabled = dto.isEnabled;
    if (dto.minPlanTier !== undefined) q.minPlanTier = dto.minPlanTier;
    if (dto.priorityScore !== undefined) q.priorityScore = dto.priorityScore;
    if (dto.targetDomain !== undefined) q.targetDomain = dto.targetDomain;
    if (dto.calculationType !== undefined) q.calculationType = dto.calculationType;
    if (dto.filterField !== undefined) q.filterField = dto.filterField;
    if (dto.filterValue !== undefined) q.filterValue = dto.filterValue;
    if (dto.displayUnit !== undefined) q.displayUnit = dto.displayUnit;

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: 'AI_QUESTION_UPDATED',
      category: 'AI_ASSISTANT',
      details: { questionId: id, changes: dto }
    });

    return q;
  }

  async updateSettings(dto: Partial<AiGlobalSettings>, actor: PlatformUser) {
    this.settings = { ...this.settings, ...dto };

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: 'AI_SETTINGS_UPDATED',
      category: 'AI_ASSISTANT',
      details: { updatedSettings: dto }
    });

    return this.settings;
  }

  async addQuestion(
    dto: {
      category: string;
      label: string;
      icon: string;
      intent: string;
      minPlanTier?: 'CORE' | 'PRO';
      priorityScore?: number;
      targetDomain?: 'ORDERS' | 'PAYMENTS' | 'KITCHEN' | 'TABLES' | 'INVENTORY' | 'SHIFTS';
      calculationType?: 'SUM' | 'COUNT' | 'AVG' | 'RATIO' | 'TOP_LIST';
      filterField?: string;
      filterValue?: string;
      displayUnit?: 'CURRENCY' | 'NUMBER' | 'PERCENT' | 'MINUTES';
    },
    actor: PlatformUser
  ) {
    const newId = `q_custom_${Date.now()}`;
    const newQ: AiQuestionItem = {
      id: newId,
      category: dto.category,
      label: dto.label,
      icon: dto.icon || 'sparkles',
      intent: dto.intent,
      minPlanTier: dto.minPlanTier || 'PRO',
      priorityScore: dto.priorityScore || 50,
      isEnabled: true,
      isCustom: true,
      targetDomain: dto.targetDomain,
      calculationType: dto.calculationType,
      filterField: dto.filterField,
      filterValue: dto.filterValue,
      displayUnit: dto.displayUnit
    };

    this.questions.push(newQ);

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: 'AI_CUSTOM_QUESTION_ADDED',
      category: 'AI_ASSISTANT',
      details: { newQuestion: newQ }
    });

    return newQ;
  }

  async deleteQuestion(id: string, actor: PlatformUser) {
    const qIndex = this.questions.findIndex((q) => q.id === id);
    if (qIndex === -1) throw new NotFoundException(`Question ${id} not found`);

    const removed = this.questions.splice(qIndex, 1)[0];

    await this.audit.log({
      actorType: 'PLATFORM',
      actorId: actor.id,
      action: 'AI_QUESTION_DELETED',
      category: 'AI_ASSISTANT',
      details: { removedQuestionId: id }
    });

    return { success: true, removedId: id };
  }

  /**
   * Tenant Endpoint: Checks plan entitlements and returns permissions
   */
  async getTenantConfig(restaurantId: string) {
    return this.prisma.runAsPlatform(async (tx) => {
      const subscription = await tx.subscription.findFirst({
        where: { restaurantId, status: { in: ['ACTIVE', 'TRIAL'] } },
        include: { plan: true }
      });

      const tier = subscription?.plan?.tier || 'CORE';
      const entitlements = (subscription?.plan?.entitlements as Record<string, boolean>) || {};
      const isEntitled = tier === 'PRO' || entitlements.posAssistant === true;

      this.activeTenantsTracking.add(restaurantId);

      // If entitled (PRO), return all enabled questions
      // If NOT entitled (CORE), return locked teaser metadata
      return {
        isEntitled,
        tier,
        planName: subscription?.plan?.name || 'JAMANVAAR CORE',
        upgradeRequired: !isEntitled,
        proUpgradePrice: 7000,
        settings: {
          delayedKotMinutes: this.settings.delayedKotMinutes,
          lowStockThreshold: this.settings.lowStockThreshold,
          cashDrawerVarianceThreshold: this.settings.cashDrawerVarianceThreshold,
          proactiveAlertsEnabled: this.settings.proactiveAlertsEnabled && isEntitled,
          mode: this.settings.mode
        },
        categories: this.categories,
        questions: isEntitled
          ? this.questions.filter((q) => q.isEnabled)
          : this.settings.corePlanTeaserEnabled
          ? this.questions.slice(0, 3) // preview teaser questions
          : []
      };
    });
  }

  /**
   * Log query invocation from tenant app
   */
  async logTelemetry(restaurantId: string, intent: string, queryText?: string) {
    this.totalQueriesCount += 1;
    this.todayQueriesCount += 1;
    this.intentFrequency[intent] = (this.intentFrequency[intent] || 0) + 1;
    this.activeTenantsTracking.add(restaurantId);

    return { success: true };
  }
}
