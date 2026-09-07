import { z } from 'zod';

export const updateQuestionSchema = z.object({
  label: z.string().min(2).max(100).optional(),
  isEnabled: z.boolean().optional(),
  minPlanTier: z.enum(['CORE', 'PRO']).optional(),
  priorityScore: z.number().int().min(0).max(1000).optional(),
  targetDomain: z.enum(['ORDERS', 'PAYMENTS', 'KITCHEN', 'TABLES', 'INVENTORY', 'SHIFTS']).optional(),
  calculationType: z.enum(['SUM', 'COUNT', 'AVG', 'RATIO', 'TOP_LIST']).optional(),
  filterField: z.string().optional(),
  filterValue: z.string().optional(),
  displayUnit: z.enum(['CURRENCY', 'NUMBER', 'PERCENT', 'MINUTES']).optional()
});

export const updateSettingsSchema = z.object({
  mode: z.enum(['OFFLINE_RULE_BASED', 'HYBRID_LLM']).optional(),
  delayedKotMinutes: z.number().int().min(5).max(60).optional(),
  lowStockThreshold: z.number().int().min(1).max(50).optional(),
  cashDrawerVarianceThreshold: z.number().int().min(50).max(10000).optional(),
  proactiveAlertsEnabled: z.boolean().optional(),
  corePlanTeaserEnabled: z.boolean().optional(),
  dailyQueryLimitPro: z.number().int().min(50).max(5000).optional()
});

export const createQuestionSchema = z.object({
  category: z.enum([
    'TODAY',
    'SALES',
    'PAYMENTS',
    'ORDERS',
    'KITCHEN',
    'TABLES',
    'MENU',
    'INVENTORY',
    'CUSTOMERS',
    'STAFF',
    'INSIGHTS'
  ]),
  label: z.string().min(2).max(100),
  icon: z.string().default('sparkles'),
  intent: z.string().min(2).max(50),
  minPlanTier: z.enum(['CORE', 'PRO']).default('PRO'),
  priorityScore: z.number().int().min(0).max(1000).default(50),
  targetDomain: z.enum(['ORDERS', 'PAYMENTS', 'KITCHEN', 'TABLES', 'INVENTORY', 'SHIFTS']).optional(),
  calculationType: z.enum(['SUM', 'COUNT', 'AVG', 'RATIO', 'TOP_LIST']).optional(),
  filterField: z.string().optional(),
  filterValue: z.string().optional(),
  displayUnit: z.enum(['CURRENCY', 'NUMBER', 'PERCENT', 'MINUTES']).optional()
});

export const logTelemetrySchema = z.object({
  intent: z.string(),
  queryText: z.string().optional()
});
