import { z } from 'zod';

export const APP_CODES = ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN', 'QR_ORDERING'] as const;

export const updateApplicationEntitlementSchema = z.object({
  enabled: z.boolean().optional(),
  // Must be true to disable an app that still has active devices; those devices stop working.
  acknowledgeDeviceImpact: z.boolean().optional(),
  // null explicitly clears an override back to "inherit the plan's maxDevices";
  // omitted leaves the current value untouched.
  deviceQuota: z.number().int().positive().nullable().optional(),
  config: z.record(z.unknown()).nullable().optional()
});
export type UpdateApplicationEntitlementDto = z.infer<typeof updateApplicationEntitlementSchema>;

export const setSubscriptionApplicationsSchema = z.object({
  // Explicit enabled-app list. Omit entirely to fall back to the plan's
  // (productFamily, tier) defaults (see DEFAULT_APPS_BY_FAMILY_TIER in the service).
  applications: z.array(z.enum(APP_CODES)).optional()
});
export type SetSubscriptionApplicationsDto = z.infer<typeof setSubscriptionApplicationsSchema>;
