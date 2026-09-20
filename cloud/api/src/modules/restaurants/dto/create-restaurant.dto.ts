import { z } from 'zod';
import { isValidGstinFormat, isValidFssaiFormat, gstinStateCodeMatches } from '../../../common/validation/gstin';

export const createRestaurantSchema = z
  .object({
    name: z.string().trim().min(2, 'Restaurant name is required'),
    legalName: z.string().trim().optional(),
    gstin: z.string().trim().toUpperCase().optional(),
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
  })
  // BUG-054: gstin/fssaiNumber used to be accepted as any string ("VVSD", "5151") and ended
  // up printed on real tax invoices. Both stay optional; a value that IS given must be valid.
  .superRefine((val, ctx) => {
    if (val.gstin && !isValidGstinFormat(val.gstin)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gstin'], message: 'GSTIN must be 15 characters in the standard format (e.g. 24AAACR5055K1Z1)' });
    } else if (val.gstin && !gstinStateCodeMatches(val.gstin, val.state)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gstin'], message: "The GSTIN's state code does not match the restaurant's state" });
    }
    if (val.fssaiNumber && !isValidFssaiFormat(val.fssaiNumber)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fssaiNumber'], message: 'FSSAI number must be 14 digits' });
    }
  });

export type CreateRestaurantDto = z.infer<typeof createRestaurantSchema>;
