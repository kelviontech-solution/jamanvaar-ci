import { z } from 'zod';

export const createRestaurantSchema = z.object({
  name: z.string().trim().min(2, 'Restaurant name is required'),
  legalName: z.string().trim().optional(),
  gstin: z.string().trim().optional(),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  country: z.string().trim().default('India'),
  timezone: z.string().trim().default('Asia/Kolkata'),
  currency: z.string().trim().default('INR'),
  defaultLanguage: z.string().trim().default('en'),

  ownerName: z.string().trim().min(2, "Owner's name is required"),
  ownerEmail: z.string().trim().toLowerCase().email(),
  ownerPhone: z.string().trim().optional()
});

export type CreateRestaurantDto = z.infer<typeof createRestaurantSchema>;
