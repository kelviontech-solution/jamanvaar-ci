import { z } from 'zod';

export const heartbeatSchema = z.object({
  lastSyncAt: z.coerce.date().optional(),
  lastBackupAt: z.coerce.date().optional(),
  syncStatus: z.string().max(200).optional(),
  appVersion: z.string().max(50).optional(),
  updateReport: z.object({
    version: z.string().min(1).max(50),
    status: z.enum(['AWAITING_RESTART', 'VERIFIED', 'NOT_INSTALLED', 'FAILED']),
    installedVersion: z.string().max(50).optional(),
    message: z.string().max(200).optional()
  }).optional(),
  osPlatform: z.string().max(80).optional(),
  pendingSyncCount: z.number().int().min(0).max(1_000_000).optional(),
  syncError: z.string().max(300).nullable().optional(),
  profileRevision: z.string().max(100).optional(),
  menuVersion: z.number().int().min(0).max(1_000_000).optional()
});
export type HeartbeatBody = z.infer<typeof heartbeatSchema>;

export const renameDeviceSchema = z.object({
  name: z.string().trim().min(1, 'Give the terminal a name').max(80)
});
export type RenameDeviceBody = z.infer<typeof renameDeviceSchema>;

const timezoneSchema = z.string().max(80).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return true; } catch { return false; } }, 'Invalid timezone');
export const operatingProfileSchema = z.object({ timezone: timezoneSchema.optional(), cutoffHour: z.number().int().min(0).max(23).optional(), effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), inherit: z.boolean().optional() }).strict();
const brandingSchema = z.object({ tagline: z.string().max(300).optional(), logoUrl: z.string().max(2000).refine(value => !value || /^https:\/\//i.test(value) || (/^\/[^\/]/.test(value) && !value.includes('\\')), 'Use an HTTPS or local image path').optional(), phone: z.string().max(40).optional(), email: z.string().max(254).optional(), pincode: z.string().max(20).optional(), website: z.string().max(500).optional(), ownerName: z.string().max(200).optional(), managerName: z.string().max(200).optional(), footerText: z.string().max(1000).optional(), primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), secondaryColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), msmeNumber: z.string().max(100).optional() }).strict();

/** B2-054: Restaurant Admin's Settings save writing the restaurant's own identity back to the cloud. */
export const restaurantIdentitySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  legalName: z.string().trim().max(200).nullable().optional(),
  gstin: z.string().trim().max(20).nullable().optional(),
  fssaiNumber: z.string().trim().max(20).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  state: z.string().trim().max(100).nullable().optional(),
  showJamanAI: z.boolean().optional(),
  operatingProfile: operatingProfileSchema.optional(),
  branding: brandingSchema.optional(),
  businessDayCutoffHour: z.number().int().min(0).max(23).optional()
});
export type RestaurantIdentityDto = z.infer<typeof restaurantIdentitySchema>;
