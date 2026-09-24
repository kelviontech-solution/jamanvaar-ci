import { z } from 'zod';

export const heartbeatSchema = z.object({
  lastSyncAt: z.coerce.date().optional(),
  lastBackupAt: z.coerce.date().optional(),
  syncStatus: z.string().max(200).optional(),
  appVersion: z.string().max(50).optional(),
  osPlatform: z.string().max(80).optional(),
  pendingSyncCount: z.number().int().min(0).max(1_000_000).optional(),
  syncError: z.string().max(300).nullable().optional()
});
export type HeartbeatBody = z.infer<typeof heartbeatSchema>;

export const renameDeviceSchema = z.object({
  name: z.string().trim().min(1, 'Give the terminal a name').max(80)
});
export type RenameDeviceBody = z.infer<typeof renameDeviceSchema>;

/** B2-054: Restaurant Admin's Settings save writing the restaurant's own identity back to the cloud. */
export const restaurantIdentitySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  legalName: z.string().trim().max(200).nullable().optional(),
  gstin: z.string().trim().max(20).nullable().optional(),
  fssaiNumber: z.string().trim().max(20).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  state: z.string().trim().max(100).nullable().optional()
});
export type RestaurantIdentityDto = z.infer<typeof restaurantIdentitySchema>;
