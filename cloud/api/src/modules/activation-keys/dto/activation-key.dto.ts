import { z } from 'zod';

export const generateActivationKeySchema = z.object({
  restaurantId: z.string().uuid(),
  subscriptionId: z.string().optional(),
  allowedDeviceType: z.enum(['POS', 'CAPTAIN', 'KDS', 'KIOSK', 'ANY']).default('ANY'),
  expiresAt: z.coerce.date()
});
export type GenerateActivationKeyDto = z.infer<typeof generateActivationKeySchema>;
