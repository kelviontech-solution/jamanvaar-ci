import { z } from 'zod';

export const createRestaurantSchema = z.object({
  name: z.string().trim().min(2, 'Restaurant name is required'),
  legalName: z.string().trim().optional(),
  gstin: z.string().trim().optional(),
  fssaiNumber: z.string().trim().optional(),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  country: z.string().trim().default('India'),
  timezone: z.string().trim().default('Asia/Kolkata'),
  currency: z.string().trim().default('INR'),
  defaultLanguage: z.string().trim().default('en'),

  ownerName: z.string().trim().min(2, "Owner's name is required"),
  ownerEmail: z.string().trim().toLowerCase().email(),
  ownerPhone: z.string().trim().optional(),
  ownerPassword: z.string().min(4).optional(),

  // Set by callers that immediately consume the activation token themselves
  // (e.g. the onboarding wizard's "set password now" mode, which calls
  // set-initial-password with this exact token a moment later) — sending the
  // invite email in that case would hand the owner a token that's already
  // dead by the time they read it.
  skipInviteEmail: z.boolean().default(false)
});

export type CreateRestaurantDto = z.infer<typeof createRestaurantSchema>;
