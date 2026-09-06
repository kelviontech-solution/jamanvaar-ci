import { z } from 'zod';

export const heartbeatSchema = z.object({
  lastSyncAt: z.coerce.date().optional(),
  lastBackupAt: z.coerce.date().optional(),
  syncStatus: z.string().max(200).optional(),
  appVersion: z.string().max(50).optional()
});
export type HeartbeatBody = z.infer<typeof heartbeatSchema>;
