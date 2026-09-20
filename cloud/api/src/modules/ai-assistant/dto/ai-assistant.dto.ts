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
  // No "mode": only the rule-based engine exists, so there is nothing to choose (BUG-056).
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
  intent: z.string().min(1).max(60),
  queryText: z.string().max(500).optional(),
  /** How long the terminal took to answer, measured on the terminal. */
  latencyMs: z.number().min(0).max(60_000).optional()
});

/** Limits the platform allows a restaurant to set for itself; the same bounds as the global thresholds. */
export const thresholdOverridesSchema = z
  .object({
    delayedKotMinutes: z.number().int().min(5).max(60),
    lowStockThreshold: z.number().int().min(1).max(50),
    cashDrawerVarianceThreshold: z.number().int().min(50).max(10000)
  })
  .partial()
  .strict();

export const restaurantAiAccessSchema = z.object({
  state: z.enum(['ON', 'LOCKED', 'OFF']).nullable().optional(),
  dailyQueryLimit: z.number().int().min(1).max(100000).nullable().optional(),
  thresholdOverrides: thresholdOverridesSchema.nullable().optional()
});
