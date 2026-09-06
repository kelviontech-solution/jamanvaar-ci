import { z } from 'zod';

export const generateActivationKeySchema = z.object({
  restaurantId: z.string().uuid(),
  subscriptionId: z.string().optional(),
  allowedDeviceType: z.enum(['POS', 'CAPTAIN', 'KDS', 'KIOSK', 'ANY']).default('ANY'),
  expiresAt: z.coerce.date()
});
export type GenerateActivationKeyDto = z.infer<typeof generateActivationKeySchema>;

// A device redeeming a code isn't authenticated yet (that's the whole point of
// this endpoint) — 'ANY' is deliberately excluded here since it's only a valid
// *allowance* on the key, never a real device's own identity.
export const redeemActivationKeySchema = z.object({
  code: z.string().trim().min(1),
  deviceType: z.enum(['POS', 'CAPTAIN', 'KDS', 'KIOSK', 'POS_ADMIN']),
  appVersion: z.string().optional()
});
export type RedeemActivationKeyDto = z.infer<typeof redeemActivationKeySchema>;
