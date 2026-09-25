import { z } from 'zod';

const APP_CODES = ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS', 'KIOSK', 'KIOSK_ADMIN', 'QR_ORDERING'] as const;

export const createFeatureSchema = z
  .object({
    code: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1),
    categoryId: z.string().uuid(),
    appCode: z.enum(APP_CODES).nullable().optional(),
    dependsOnFeatureIds: z.array(z.string().uuid()).optional(),
    defaultDeviceQuota: z.number().int().positive().nullable().optional(),
    legacyEntitlementKey: z.undefined({ message: 'legacyEntitlementKey can only be set by the seed, never through this API' }).optional()
  })
  .strict();
export type CreateFeatureDto = z.infer<typeof createFeatureSchema>;

export const updateFeatureSchema = z
  .object({
    code: z.undefined({ message: 'code is immutable once created' }).optional(),
    legacyEntitlementKey: z.undefined({ message: 'legacyEntitlementKey is immutable' }).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().min(1).optional(),
    categoryId: z.string().uuid().optional(),
    appCode: z.enum(APP_CODES).nullable().optional(),
    dependsOnFeatureIds: z.array(z.string().uuid()).optional(),
    defaultDeviceQuota: z.number().int().positive().nullable().optional(),
    isActive: z.boolean().optional()
  })
  .strict();
export type UpdateFeatureDto = z.infer<typeof updateFeatureSchema>;
