import { z } from 'zod';
import { entitlementsSchema } from '../entitlements';

export const createPlanSchema = z.object({
  tier: z.enum(['CORE', 'PRO', 'ENTERPRISE']),
  name: z.string().trim().min(2, 'Plan name is required'),
  description: z.string().trim().optional(),
  priceMonthly: z.number().int().nonnegative('Monthly price must be 0 or more'),
  priceYearly: z.number().int().nonnegative().optional(),
  maxBranches: z.number().int().positive('Must allow at least 1 branch'),
  maxDevices: z.number().int().positive('Must allow at least 1 device'),
  maxUsers: z.number().int().positive('Must allow at least 1 user'),
  entitlements: entitlementsSchema
});
export type CreatePlanDto = z.infer<typeof createPlanSchema>;

export const updatePlanSchema = createPlanSchema.partial();
export type UpdatePlanDto = z.infer<typeof updatePlanSchema>;
