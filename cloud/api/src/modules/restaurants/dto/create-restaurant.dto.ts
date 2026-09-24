import { z } from 'zod';
import { isValidGstinFormat, isValidFssaiFormat, gstinStateCodeMatches } from '../../../common/validation/gstin';
import { isValidIndianPhone } from '../../../common/validation/phone';
import { strongPassword } from '../../../common/validation/password';

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
    // Optional at the API level (many internal/test callers create a restaurant with no
    // identity concept at all) — Super Admin's onboarding UI is where this is made required
    // in practice (Phase 5/7). When given, it must be a valid Indian mobile and generates the
    // customer-facing restaurantCode; when omitted, restaurantCode/mobile simply stay null,
    // the same state a pre-Phase-1 legacy restaurant is in before the backfill script runs.
    mobile: z.string().trim().refine(isValidIndianPhone, 'A valid 10-digit Indian mobile number is required').optional(),
    timezone: z.string().trim().default('Asia/Kolkata'),
    currency: z.string().trim().default('INR'),
    defaultLanguage: z.string().trim().default('en'),

    ownerName: z.string().trim().min(2, "Owner's name is required"),
    ownerEmail: z.string().trim().toLowerCase().email(),
    ownerPhone: z.string().trim().optional(),
    // B2-005 / security-audit LOW-07: was z.string().min(4) — an owner account (controls
    // staff, devices and the cloud login for the whole restaurant) could be created with a
    // 4-character password, confirmed live with 'abcd'. Same strength rule every other real
    // credential in the product uses (`strongPassword`), not a weaker one just because Super
    // Admin sets it on the owner's behalf at onboarding time.
    ownerPassword: strongPassword.optional(),

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
