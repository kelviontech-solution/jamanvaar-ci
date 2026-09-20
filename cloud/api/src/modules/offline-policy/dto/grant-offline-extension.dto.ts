import { z } from 'zod';

export const grantOfflineExtensionSchema = z.object({
  restaurantId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional(),
  extensionDays: z.number().int('Extension days must be a whole number').min(1).max(90),
  reason: z.string().trim().min(5, 'Give a reason of at least 5 characters').max(500),
  requestedBy: z.string().trim().min(2, 'Say who asked for this extension').max(120),
  ticketRef: z.string().trim().max(60).optional()
});
export type GrantOfflineExtensionDto = z.infer<typeof grantOfflineExtensionSchema>;
