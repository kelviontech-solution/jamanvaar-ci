import { z } from 'zod';

export const assignSubscriptionSchema = z.object({
  restaurantId: z.string().uuid(),
  planId: z.string().min(1),
  status: z.enum(['TRIAL', 'ACTIVE']).default('ACTIVE'),
  expiresAt: z.coerce.date(),
  trialEndsAt: z.coerce.date().optional(),
  // Explicit enabled-application list from the onboarding wizard's modules
  // step. Omit to fall back to the plan tier's defaults (see
  // DEFAULT_APPS_BY_TIER in application-entitlements.service.ts) — every
  // subscription gets one ApplicationEntitlement row per AppCode either way.
  applications: z.array(z.enum(['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN'])).optional()
});
export type AssignSubscriptionDto = z.infer<typeof assignSubscriptionSchema>;

export const changePlanSchema = z.object({
  planId: z.string().min(1)
});

export const extendSchema = z.object({
  days: z.number().int().min(1).max(365)
});

export const renewSchema = z.object({
  expiresAt: z.coerce.date()
});
