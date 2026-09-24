import { z } from 'zod';
import { RESTAURANT_CODE_RE } from '../restaurant-code.util';

export const resolveRestaurantCodeSchema = z.object({
  restaurantCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(RESTAURANT_CODE_RE, 'Restaurant ID must look like JM9876543210')
});
export type ResolveRestaurantCodeDto = z.infer<typeof resolveRestaurantCodeSchema>;
