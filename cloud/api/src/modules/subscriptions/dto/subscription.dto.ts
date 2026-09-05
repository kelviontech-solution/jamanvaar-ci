import { z } from 'zod';

export const assignSubscriptionSchema = z.object({
  restaurantId: z.string().uuid(),
  planId: z.string().min(1),
  status: z.enum(['TRIAL', 'ACTIVE']).default('ACTIVE'),
  expiresAt: z.coerce.date(),
  trialEndsAt: z.coerce.date().optional()
});
export type AssignSubscriptionDto = z.infer<typeof assignSubscriptionSchema>;

export const changePlanSchema = z.object({
  planId: z.string().min(1)
});

export const renewSchema = z.object({
  expiresAt: z.coerce.date()
});
