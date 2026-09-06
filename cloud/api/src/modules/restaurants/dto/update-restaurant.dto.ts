import { z } from 'zod';

export const updateRestaurantSchema = z.object({
  name: z.string().trim().min(2).optional(),
  legalName: z.string().trim().optional(),
  gstin: z.string().trim().optional(),
  fssaiNumber: z.string().trim().optional(),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  country: z.string().trim().optional(),
  timezone: z.string().trim().optional(),
  currency: z.string().trim().optional(),
  defaultLanguage: z.string().trim().optional()
});
export type UpdateRestaurantDto = z.infer<typeof updateRestaurantSchema>;
