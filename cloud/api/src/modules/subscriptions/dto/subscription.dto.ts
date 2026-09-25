import { z } from 'zod';

// B2-050: renewing a subscription with `expiresAt: 2020-01-01` was accepted (200) and left the
// subscription `status: ACTIVE` with an expiry six years in the past — the restaurant's owner
// could still sign in and Super Admin could still issue activation keys for it. Applied to every
// expiresAt in this module, not just renew: the same defect would reproduce identically on assign.
const futureDate = () => z.coerce.date().refine((d) => d.getTime() > Date.now(), { message: 'expiresAt must be in the future' });

export const assignSubscriptionSchema = z.object({
  restaurantId: z.string().uuid(),
  planId: z.string().min(1),
  status: z.enum(['TRIAL', 'ACTIVE']).default('ACTIVE'),
  expiresAt: futureDate(),
  trialEndsAt: z.coerce.date().optional(),
  // Explicit enabled-application list from the onboarding wizard's modules
  // step. Omit to fall back to the plan's (productFamily, tier) defaults (see
  // DEFAULT_APPS_BY_FAMILY_TIER in application-entitlements.service.ts) — every
  // subscription gets one ApplicationEntitlement row per AppCode either way.
  applications: z.array(z.enum(['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN', 'QR_ORDERING'])).optional()
});
export type AssignSubscriptionDto = z.infer<typeof assignSubscriptionSchema>;

export const changePlanSchema = z.object({
  planId: z.string().min(1)
});

export const extendSchema = z.object({
  days: z.number().int().min(1).max(365)
});

export const renewSchema = z.object({
  expiresAt: futureDate()
});
