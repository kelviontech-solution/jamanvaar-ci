import { z } from 'zod';

export const APP_CODES = ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN'] as const;

export const updateApplicationEntitlementSchema = z.object({
  enabled: z.boolean().optional(),
  // null explicitly clears an override back to "inherit the plan's maxDevices";
  // omitted leaves the current value untouched.
  deviceQuota: z.number().int().positive().nullable().optional(),
  config: z.record(z.unknown()).nullable().optional()
});
export type UpdateApplicationEntitlementDto = z.infer<typeof updateApplicationEntitlementSchema>;

export const setSubscriptionApplicationsSchema = z.object({
  // Explicit enabled-app list. Omit entirely to fall back to the plan
  // tier's defaults (see DEFAULT_APPS_BY_TIER in the service).
  applications: z.array(z.enum(APP_CODES)).optional()
});
export type SetSubscriptionApplicationsDto = z.infer<typeof setSubscriptionApplicationsSchema>;
