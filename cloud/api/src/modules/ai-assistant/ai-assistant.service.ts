import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PlatformUser } from '@prisma/client';
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

/** The platform-wide thresholds. Only the rule-based engine exists, so there is no "mode" to choose. */
export interface AiGlobalSettings {
  delayedKotMinutes: number;
  lowStockThreshold: number;
  cashDrawerVarianceThreshold: number;
  proactiveAlertsEnabled: boolean;
  corePlanTeaserEnabled: boolean;
  dailyQueryLimitPro: number;
  mode: 'OFFLINE_RULE_BASED';
}

export type AiAccessState = 'ON' | 'LOCKED' | 'OFF';
export type ThresholdOverrides = Partial<Pick<AiGlobalSettings, 'delayedKotMinutes' | 'lowStockThreshold' | 'cashDrawerVarianceThreshold'>>;

export const DEFAULT_AI_SETTINGS: AiGlobalSettings = {
  mode: 'OFFLINE_RULE_BASED',
  delayedKotMinutes: 15,
  lowStockThreshold: 3,
  cashDrawerVarianceThreshold: 500,
  proactiveAlertsEnabled: true,
  corePlanTeaserEnabled: true,
  dailyQueryLimitPro: 500
};

const SETTINGS_KEY = 'ai.settings';

const DEFAULT_CATEGORIES: AiCategory[] = [
  { id: 'TODAY', label: "Today's Pulse", icon: 'clock', description: 'Real-time daily metrics for active business day' },
  { id: 'SALES', label: 'Sales & Finance', icon: 'trending-up', description: 'Gross revenue, AOV, tax, and sales velocity' },
  { id: 'PAYMENTS', label: 'Payment Split', icon: 'credit-card', description: 'Cash drawer, UPI QR, card, and refunds' },
  { id: 'ORDERS', label: 'Order Pipeline', icon: 'shopping-bag', description: 'Active, completed, dine-in and takeaway' },
  { id: 'KITCHEN', label: 'Kitchen & KOT', icon: 'chef-hat', description: 'Delayed tickets, queue times, and station loads' },
  { id: 'TABLES', label: 'Dining Tables', icon: 'layout-grid', description: 'Occupancy rate, vacant tables, and billing requests' },
  { id: 'MENU', label: 'Menu Analytics', icon: 'utensils', description: 'Top dishes, fast movers, and category revenue' },
  { id: 'INVENTORY', label: 'Stock & Inventory', icon: 'package', description: 'Low stock alerts, out-of-stock items, and consumption' },
  { id: 'CUSTOMERS', label: 'Customer CRM', icon: 'users', description: 'Footfall, repeat visit rate, and top spenders' },
  { id: 'STAFF', label: 'Staff & Shift', icon: 'user-check', description: 'Cashier sales, captain orders, and active shift variance' },
  { id: 'INSIGHTS', label: '✨ Business Insights', icon: 'sparkles', description: 'Smart operational recommendations & opportunities' }
];

type Seed = Omit<AiQuestionItem, 'isEnabled'>;

/**
 * The first-run catalogue (BUG-058). Every question has its OWN intent, so no two answer identically, and
 * questions that no terminal can answer from real data (Swiggy / Zomato channels are recorded nowhere) are
 * not offered. {delayedKotMinutes} / {lowStockThreshold} in a label are filled from the settings.
 */
const INITIAL_QUESTIONS: Seed[] = [
  { id: 'q_today_sales', category: 'TODAY', label: "Today's Gross Sales", icon: 'trending-up', intent: 'TODAY_SALES', minPlanTier: 'PRO', priorityScore: 100 },
  { id: 'q_today_orders', category: 'TODAY', label: "Today's Total Orders", icon: 'shopping-bag', intent: 'TODAY_ORDERS', minPlanTier: 'PRO', priorityScore: 95 },
  { id: 'q_today_aov', category: 'TODAY', label: 'Average Order Value (AOV)', icon: 'bar-chart-3', intent: 'AOV', minPlanTier: 'PRO', priorityScore: 90 },
  { id: 'q_today_cash', category: 'TODAY', label: 'Cash in Drawer & Float', icon: 'coins', intent: 'CASH_COLLECTION', minPlanTier: 'PRO', priorityScore: 85 },
  { id: 'q_today_upi', category: 'TODAY', label: 'UPI QR Collections', icon: 'smartphone', intent: 'UPI_COLLECTION', minPlanTier: 'PRO', priorityScore: 80 },
  { id: 'q_today_tax', category: 'TODAY', label: "Today's GST Tax Breakdown", icon: 'receipt', intent: 'TAX_SUMMARY', minPlanTier: 'PRO', priorityScore: 75 },
  { id: 'q_today_discounts', category: 'TODAY', label: 'Discounts & Offers Given', icon: 'sparkles', intent: 'TODAY_DISCOUNTS', minPlanTier: 'PRO', priorityScore: 70 },
  { id: 'q_sales_busiest', category: 'SALES', label: 'Busiest Trading Hour', icon: 'clock', intent: 'BUSIEST_HOUR', minPlanTier: 'PRO', priorityScore: 85 },
  { id: 'q_sales_combos', category: 'SALES', label: 'Popular Order Combos', icon: 'utensils', intent: 'POPULAR_COMBOS', minPlanTier: 'PRO', priorityScore: 80 },
  { id: 'q_sales_refunds', category: 'SALES', label: 'Refunds & Voids Summary', icon: 'rotate-ccw', intent: 'TODAY_REFUNDS', minPlanTier: 'PRO', priorityScore: 75 },
  { id: 'q_sales_cancelled', category: 'SALES', label: 'Cancelled Bills & Voids', icon: 'alert-triangle', intent: 'TODAY_CANCELLED', minPlanTier: 'PRO', priorityScore: 70 },
  { id: 'q_pay_summary', category: 'PAYMENTS', label: 'Complete Tender Breakdown', icon: 'credit-card', intent: 'PAYMENT_SUMMARY', minPlanTier: 'PRO', priorityScore: 90 },
  { id: 'q_pay_card', category: 'PAYMENTS', label: 'Card Swipes & POS Machine', icon: 'credit-card', intent: 'CARD_COLLECTION', minPlanTier: 'PRO', priorityScore: 80 },
  { id: 'q_pay_share', category: 'PAYMENTS', label: 'Cash vs Digital Payment Share', icon: 'pie-chart', intent: 'PAYMENT_SHARE', minPlanTier: 'PRO', priorityScore: 75 },
  { id: 'q_orders_dinein', category: 'ORDERS', label: 'Dine-In Revenue Today', icon: 'utensils', intent: 'DINE_IN_REVENUE', minPlanTier: 'PRO', priorityScore: 85, targetDomain: 'ORDERS', calculationType: 'SUM', filterField: 'channel', filterValue: 'DINE_IN', displayUnit: 'CURRENCY' },
  { id: 'q_orders_takeaway', category: 'ORDERS', label: 'Takeaway / Parcel Revenue Today', icon: 'shopping-bag', intent: 'TAKEAWAY_REVENUE', minPlanTier: 'PRO', priorityScore: 82, targetDomain: 'ORDERS', calculationType: 'SUM', filterField: 'channel', filterValue: 'TAKEAWAY', displayUnit: 'CURRENCY' },
  { id: 'q_orders_active', category: 'ORDERS', label: 'Current In-Progress Orders', icon: 'flame', intent: 'ACTIVE_ORDERS', minPlanTier: 'PRO', priorityScore: 80 },
  { id: 'q_orders_completed', category: 'ORDERS', label: 'Completed & Settled Orders', icon: 'check-circle-2', intent: 'COMPLETED_ORDERS', minPlanTier: 'PRO', priorityScore: 70 },
  { id: 'q_kitchen_delayed', category: 'KITCHEN', label: 'Delayed KOTs (> {delayedKotMinutes} mins)', icon: 'flame', intent: 'DELAYED_KOT', minPlanTier: 'PRO', priorityScore: 100, targetDomain: 'KITCHEN', calculationType: 'COUNT', filterField: 'status', filterValue: 'DELAYED', displayUnit: 'NUMBER' },
  { id: 'q_kitchen_pending', category: 'KITCHEN', label: 'Active Live KOT Queue', icon: 'chef-hat', intent: 'PENDING_KOT', minPlanTier: 'PRO', priorityScore: 90, targetDomain: 'KITCHEN', calculationType: 'COUNT', filterField: 'status', filterValue: 'PENDING', displayUnit: 'NUMBER' },
  { id: 'q_kitchen_perf', category: 'KITCHEN', label: 'Kitchen Station Turnaround', icon: 'clock', intent: 'KITCHEN_PERFORMANCE', minPlanTier: 'PRO', priorityScore: 80 },
  { id: 'q_inv_low', category: 'INVENTORY', label: 'Critical Low Stock Ingredients', icon: 'alert-triangle', intent: 'LOW_STOCK', minPlanTier: 'PRO', priorityScore: 100, targetDomain: 'INVENTORY', calculationType: 'COUNT', filterField: 'status', filterValue: 'LOW_STOCK', displayUnit: 'NUMBER' },
  { id: 'q_inv_out', category: 'INVENTORY', label: 'Out of Stock Dishes (86 List)', icon: 'package', intent: 'OUT_OF_STOCK', minPlanTier: 'PRO', priorityScore: 90, targetDomain: 'INVENTORY', calculationType: 'COUNT', filterField: 'status', filterValue: 'OUT_OF_STOCK', displayUnit: 'NUMBER' },
  { id: 'q_table_occ', category: 'TABLES', label: 'Dining Floor Occupancy %', icon: 'layout-grid', intent: 'TABLE_OCCUPANCY', minPlanTier: 'PRO', priorityScore: 85, targetDomain: 'TABLES', calculationType: 'RATIO', filterField: 'status', filterValue: 'OCCUPIED', displayUnit: 'PERCENT' },
  { id: 'q_table_avail', category: 'TABLES', label: 'Available Clean Tables', icon: 'check-circle-2', intent: 'AVAILABLE_TABLES', minPlanTier: 'PRO', priorityScore: 80, targetDomain: 'TABLES', calculationType: 'COUNT', filterField: 'status', filterValue: 'AVAILABLE', displayUnit: 'NUMBER' },
  { id: 'q_menu_top', category: 'MENU', label: 'Top Selling Dishes by Volume', icon: 'utensils', intent: 'TOP_ITEMS', minPlanTier: 'PRO', priorityScore: 95 },
  { id: 'q_menu_least', category: 'MENU', label: 'Slow Moving / Least Ordered Items', icon: 'package', intent: 'LEAST_ITEMS', minPlanTier: 'PRO', priorityScore: 85 },
  { id: 'q_menu_cat', category: 'MENU', label: 'Revenue by Menu Category', icon: 'bar-chart-3', intent: 'BEST_CATEGORY', minPlanTier: 'PRO', priorityScore: 80 },
  { id: 'q_cust_diners', category: 'CUSTOMERS', label: 'Footfall: Parties Served Today', icon: 'users', intent: 'FOOTFALL', minPlanTier: 'PRO', priorityScore: 75 },
  { id: 'q_staff_active', category: 'STAFF', label: 'Active Logged-in Staff', icon: 'user-check', intent: 'ACTIVE_STAFF', minPlanTier: 'PRO', priorityScore: 80 },
  { id: 'q_staff_cash_var', category: 'STAFF', label: 'Cashier Shift Cash Variance', icon: 'coins', intent: 'CASH_VARIANCE', minPlanTier: 'PRO', priorityScore: 75, targetDomain: 'SHIFTS', calculationType: 'SUM', filterField: 'status', filterValue: 'ACTIVE', displayUnit: 'CURRENCY' },
  { id: 'q_insight_eod', category: 'INSIGHTS', label: 'Executive EOD Closing Brief', icon: 'sparkles', intent: 'END_OF_DAY', minPlanTier: 'PRO', priorityScore: 100 }
];

const today = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');

const toItem = (q: Prisma.AiQuestionGetPayload<object>): AiQuestionItem => ({
  id: q.id,
  category: q.category,
  label: q.label,
  icon: q.icon,
  intent: q.intent,
  minPlanTier: q.minPlanTier === 'CORE' ? 'CORE' : 'PRO',
  priorityScore: q.priorityScore,
  isEnabled: q.isEnabled,
  isCustom: q.isCustom || undefined,
  targetDomain: (q.targetDomain as AiQuestionItem['targetDomain']) ?? undefined,
  calculationType: (q.calculationType as AiQuestionItem['calculationType']) ?? undefined,
  filterField: q.filterField ?? undefined,
  filterValue: q.filterValue ?? undefined,
  displayUnit: (q.displayUnit as AiQuestionItem['displayUnit']) ?? undefined
});

/** Fills {placeholders} in a label from the thresholds in force, so the words always match the number used. */
export function renderLabel(label: string, s: Pick<AiGlobalSettings, 'delayedKotMinutes' | 'lowStockThreshold'>): string {
  return label.replace(/\{delayedKotMinutes\}/g, String(s.delayedKotMinutes)).replace(/\{lowStockThreshold\}/g, String(s.lowStockThreshold));
}

@Injectable()
export class AiAssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  // ---- storage ----------------------------------------------------------------------------

  /** The catalogue is created in the database the first time it is needed. Safe if two requests race. */
  private async ensureSeeded(): Promise<void> {
    if ((await this.prisma.platformDb.aiQuestion.count()) > 0) return;
    await this.prisma.platformDb.aiQuestion.createMany({
      data: INITIAL_QUESTIONS.map((q) => ({ ...q, isEnabled: true, isCustom: false })),
      skipDuplicates: true
    });
  }

  async getSettings(): Promise<AiGlobalSettings> {
    const row = await this.prisma.platformDb.platformSetting.findUnique({ where: { key: SETTINGS_KEY } });
    return { ...DEFAULT_AI_SETTINGS, ...((row?.value as Partial<AiGlobalSettings>) ?? {}), mode: 'OFFLINE_RULE_BASED' };
  }

  private async questions(): Promise<AiQuestionItem[]> {
    await this.ensureSeeded();
    const rows = await this.prisma.platformDb.aiQuestion.findMany({ orderBy: [{ priorityScore: 'desc' }, { id: 'asc' }] });
    return rows.map(toItem);
  }

  // ---- Super Admin: configuration and real telemetry ----------------------------------------

  async getConfig() {
    const settings = await this.getSettings();
    const questions = (await this.questions()).map((q) => ({ ...q, label: renderLabel(q.label, settings) }));
    const day = today();

    const [proSubscriptions, totalActiveSubscriptions, totals, todayTotals, byIntent, restaurantsToday] = await Promise.all([
      this.prisma.platformDb.subscription.count({ where: { status: { in: ['ACTIVE', 'TRIAL'] }, plan: { tier: 'PRO' } } }),
      this.prisma.platformDb.subscription.count({ where: { status: { in: ['ACTIVE', 'TRIAL'] } } }),
      this.prisma.platformDb.aiUsageDaily.aggregate({ _sum: { queries: true, totalLatencyMs: true } }),
      this.prisma.platformDb.aiUsageDaily.aggregate({ where: { day }, _sum: { queries: true } }),
      this.prisma.platformDb.aiUsageDaily.groupBy({ by: ['intent'], _sum: { queries: true }, orderBy: { _sum: { queries: 'desc' } }, take: 5 }),
      this.prisma.platformDb.aiUsageDaily.groupBy({ by: ['restaurantId'], where: { day } })
    ]);

    const totalQueries = totals._sum.queries ?? 0;
    return {
      categories: DEFAULT_CATEGORIES,
      questions,
      settings,
      telemetry: {
        // Counted from real queries only: no seeded numbers.
        totalQueries,
        todayQueries: todayTotals._sum.queries ?? 0,
        restaurantsUsingToday: restaurantsToday.length,
        activeProTenants: proSubscriptions,
        totalActiveTenants: totalActiveSubscriptions,
        adoptionRatePercent: totalActiveSubscriptions > 0 ? Math.round((proSubscriptions / totalActiveSubscriptions) * 100) : 0,
        topIntent: byIntent[0]?.intent ?? null,
        topIntents: byIntent.map((t) => ({ intent: t.intent, count: t._sum.queries ?? 0 })),
        // Measured, average per query as reported by the terminals; null until there is data.
        latencyMs: totalQueries > 0 ? Math.round(((totals._sum.totalLatencyMs ?? 0) / totalQueries) * 10) / 10 : null
      }
    };
  }

  async updateQuestion(id: string, dto: Partial<AiQuestionItem>, actor: PlatformUser) {
    await this.ensureSeeded();
    const existing = await this.prisma.platformDb.aiQuestion.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Question ${id} not found`);
    const { label, isEnabled, minPlanTier, priorityScore, targetDomain, calculationType, filterField, filterValue, displayUnit } = dto;
    const updated = await this.prisma.platformDb.aiQuestion.update({
      where: { id },
      data: { label, isEnabled, minPlanTier, priorityScore, targetDomain, calculationType, filterField, filterValue, displayUnit }
    });
    await this.audit.log({ actorType: 'PLATFORM', actorId: actor.id, action: 'AI_QUESTION_UPDATED', category: 'AI_ASSISTANT', details: { questionId: id, changes: dto } });
    return toItem(updated);
  }

  async updateSettings(dto: Partial<AiGlobalSettings>, actor: PlatformUser) {
    const next = { ...(await this.getSettings()), ...dto, mode: 'OFFLINE_RULE_BASED' as const };
    await this.prisma.platformDb.platformSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, value: next as unknown as Prisma.InputJsonValue, category: 'AI', description: 'JAMAN AI global thresholds and limits', updatedBy: actor.id },
      update: { value: next as unknown as Prisma.InputJsonValue, updatedBy: actor.id }
    });
    await this.audit.log({ actorType: 'PLATFORM', actorId: actor.id, action: 'AI_SETTINGS_UPDATED', category: 'AI_ASSISTANT', details: { updatedSettings: dto } });
    return next;
  }

  async addQuestion(dto: Omit<AiQuestionItem, 'id' | 'isEnabled' | 'isCustom'>, actor: PlatformUser) {
    await this.ensureSeeded();
    const created = await this.prisma.platformDb.aiQuestion.create({
      data: {
        id: `q_custom_${Date.now()}`,
        category: dto.category,
        label: dto.label,
        icon: dto.icon || 'sparkles',
        intent: dto.intent,
        minPlanTier: dto.minPlanTier || 'PRO',
        priorityScore: dto.priorityScore ?? 50,
        isEnabled: true,
        isCustom: true,
        targetDomain: dto.targetDomain,
        calculationType: dto.calculationType,
        filterField: dto.filterField,
        filterValue: dto.filterValue,
        displayUnit: dto.displayUnit
      }
    });
    await this.audit.log({ actorType: 'PLATFORM', actorId: actor.id, action: 'AI_CUSTOM_QUESTION_ADDED', category: 'AI_ASSISTANT', details: { newQuestion: toItem(created) } });
    return toItem(created);
  }

  async deleteQuestion(id: string, actor: PlatformUser) {
    const existing = await this.prisma.platformDb.aiQuestion.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Question ${id} not found`);
    await this.prisma.platformDb.aiQuestion.delete({ where: { id } });
    await this.audit.log({ actorType: 'PLATFORM', actorId: actor.id, action: 'AI_QUESTION_DELETED', category: 'AI_ASSISTANT', details: { removedQuestionId: id } });
    return { success: true, removedId: id };
  }

  // ---- per-restaurant access ------------------------------------------------------------------

  async getRestaurantAccess(restaurantId: string) {
    const r = await this.resolve(restaurantId);
    const row = await this.prisma.platformDb.restaurantAiAccess.findUnique({ where: { restaurantId } });
    return { ...r, override: row ? { state: row.state, dailyQueryLimit: row.dailyQueryLimit, thresholdOverrides: row.thresholdOverrides } : null };
  }

  async setRestaurantAccess(
    restaurantId: string,
    dto: { state?: AiAccessState | null; dailyQueryLimit?: number | null; thresholdOverrides?: ThresholdOverrides | null },
    actor: PlatformUser
  ) {
    const restaurant = await this.prisma.platformDb.restaurant.findFirst({ where: { id: restaurantId, deletedAt: null }, select: { id: true } });
    if (!restaurant) throw new NotFoundException('Restaurant not found');

    const data: Prisma.RestaurantAiAccessUncheckedUpdateInput = {};
    if (dto.state !== undefined) data.state = dto.state;
    if (dto.dailyQueryLimit !== undefined) data.dailyQueryLimit = dto.dailyQueryLimit;
    if (dto.thresholdOverrides !== undefined) data.thresholdOverrides = dto.thresholdOverrides === null ? Prisma.DbNull : (dto.thresholdOverrides as Prisma.InputJsonValue);
    await this.prisma.platformDb.restaurantAiAccess.upsert({
      where: { restaurantId },
      create: { restaurantId, state: dto.state ?? null, dailyQueryLimit: dto.dailyQueryLimit ?? null, thresholdOverrides: dto.thresholdOverrides ? (dto.thresholdOverrides as Prisma.InputJsonValue) : Prisma.DbNull },
      update: data
    });
    await this.audit.log({ actorType: 'PLATFORM', actorId: actor.id, restaurantId, action: 'AI_RESTAURANT_ACCESS_UPDATED', category: 'AI_ASSISTANT', details: { changes: dto } });
    return this.getRestaurantAccess(restaurantId);
  }

  /**
   * What JAMAN AI does for one restaurant (BUG-057): an explicit choice for the restaurant wins,
   * otherwise the plan decides (PRO or the posAssistant entitlement = ON; anything else LOCKED with a
   * teaser, or OFF when the teaser is switched off). Thresholds are the platform's, with the
   * restaurant's own overrides on top.
   */
  async resolve(restaurantId: string) {
    const [settings, access, subscription, usedRow] = await Promise.all([
      this.getSettings(),
      this.prisma.platformDb.restaurantAiAccess.findUnique({ where: { restaurantId } }),
      this.prisma.platformDb.subscription.findFirst({ where: { restaurantId, status: { in: ['ACTIVE', 'TRIAL'] } }, include: { plan: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.platformDb.aiUsageDaily.aggregate({ where: { restaurantId, day: today() }, _sum: { queries: true } })
    ]);

    const tier = subscription?.plan?.tier ?? 'CORE';
    const entitlements = (subscription?.plan?.entitlements as Record<string, boolean> | undefined) ?? {};
    const planAllows = tier === 'PRO' || entitlements.posAssistant === true;
    const planState: AiAccessState = planAllows ? 'ON' : settings.corePlanTeaserEnabled ? 'LOCKED' : 'OFF';
    const explicit = access?.state === 'ON' || access?.state === 'LOCKED' || access?.state === 'OFF' ? (access.state as AiAccessState) : null;

    const overrides = (access?.thresholdOverrides as ThresholdOverrides | null) ?? {};
    const merged: AiGlobalSettings = { ...settings, ...overrides };
    const dailyLimit = access?.dailyQueryLimit ?? (tier === 'PRO' ? settings.dailyQueryLimitPro : null);
    const usedToday = usedRow._sum.queries ?? 0;

    return {
      state: explicit ?? planState,
      source: (explicit ? 'RESTAURANT' : 'PLAN') as 'RESTAURANT' | 'PLAN',
      tier,
      planName: subscription?.plan?.name ?? null,
      settings: merged,
      dailyLimit,
      usedToday,
      remainingToday: dailyLimit === null ? null : Math.max(0, dailyLimit - usedToday),
      limitReached: dailyLimit !== null && usedToday >= dailyLimit
    };
  }

  // ---- delivered to the terminals -------------------------------------------------------------

  /** The catalogue and thresholds one restaurant's terminals should use. Cached by the apps for offline use. */
  async getDeviceConfig(restaurantId: string) {
    const r = await this.resolve(restaurantId);
    const all = (await this.questions()).filter((q) => q.isEnabled).map((q) => ({ ...q, label: renderLabel(q.label, r.settings) }));
    return {
      state: r.state,
      source: r.source,
      tier: r.tier,
      planName: r.planName,
      settings: {
        delayedKotMinutes: r.settings.delayedKotMinutes,
        lowStockThreshold: r.settings.lowStockThreshold,
        cashDrawerVarianceThreshold: r.settings.cashDrawerVarianceThreshold,
        proactiveAlertsEnabled: r.settings.proactiveAlertsEnabled && r.state === 'ON'
      },
      categories: DEFAULT_CATEGORIES,
      // Only an ON restaurant receives questions to answer; a LOCKED one gets a few labels to show what it is missing.
      questions: r.state === 'ON' ? all : [],
      teaser: r.state === 'LOCKED' ? all.slice(0, 3).map((q) => ({ label: q.label, icon: q.icon })) : [],
      dailyLimit: r.dailyLimit,
      usedToday: r.usedToday,
      remainingToday: r.remainingToday,
      limitReached: r.limitReached
    };
  }

  /** The Restaurant Admin (staff login) view: the same decision, plus the fields it already understood. */
  async getTenantConfig(restaurantId: string) {
    const cfg = await this.getDeviceConfig(restaurantId);
    // The real price of the PRO plan, not a number typed into the code.
    const pro = await this.prisma.platformDb.plan.findFirst({ where: { tier: 'PRO', status: 'ACTIVE' }, orderBy: { priceMonthly: 'asc' }, select: { priceMonthly: true, name: true } });
    return { ...cfg, isEntitled: cfg.state === 'ON', upgradeRequired: cfg.state !== 'ON', proUpgradePrice: pro ? pro.priceMonthly / 100 : null, proPlanName: pro?.name ?? null };
  }

  /**
   * One real query, recorded with its measured latency (BUG-055). Refused for a restaurant whose AI is not ON.
   * Returns how many are left today so a terminal can stop before the limit is exceeded.
   */
  async logTelemetry(restaurantId: string, intent: string, latencyMs: number | undefined) {
    const before = await this.resolve(restaurantId);
    if (before.state !== 'ON') throw new ForbiddenException('JAMAN AI is not enabled for this restaurant');
    if (!intent || intent.length > 60) throw new BadRequestException('Invalid intent');

    const latency = Math.max(0, Math.min(60_000, Math.round(latencyMs ?? 0)));
    await this.prisma.platformDb.aiUsageDaily.upsert({
      where: { restaurantId_day_intent: { restaurantId, day: today(), intent } },
      create: { restaurantId, day: today(), intent, queries: 1, totalLatencyMs: latency },
      update: { queries: { increment: 1 }, totalLatencyMs: { increment: latency } }
    });
    const after = await this.resolve(restaurantId);
    return { success: true, usedToday: after.usedToday, remainingToday: after.remainingToday, limitReached: after.limitReached };
  }
}
