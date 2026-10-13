import { z } from 'zod';
import { isValidGstinFormat, isValidFssaiFormat, gstinStateCodeMatches } from '../../../common/validation/gstin';
import { isValidIndianPhone, normalizeIndianPhone } from '../../../common/validation/phone';

export const updateRestaurantSchema = z
  .object({
    name: z.string().trim().min(2).optional(),
    legalName: z.string().trim().optional(),
    gstin: z.string().trim().toUpperCase().optional(),
    fssaiNumber: z.string().trim().optional(),
    address: z.string().trim().optional(),
    city: z.string().trim().optional(),
    state: z.string().trim().optional(),
    country: z.string().trim().optional(),
    // Editable independently of restaurantCode (spec section 3): a restaurant's phone number
    // can change without its customer-facing Restaurant ID changing. restaurantCode itself is
    // deliberately absent from this schema — Zod strips unknown keys, so it can never be set
    // here regardless of what a caller sends (see restaurants.e2e.spec.ts's immutability test).
    mobile: z.string().trim().refine(isValidIndianPhone, 'A valid 10-digit Indian mobile number is required').transform(normalizeIndianPhone).optional(),
    timezone: z.string().trim().optional(),
    currency: z.string().trim().optional(),
    defaultLanguage: z.string().trim().optional(),
    // White-label branding Super Admin can set on a restaurant's behalf -- e.g. onboarding an
    // enterprise chain that wants its own identity on customer-facing Kiosk/QR screens rather
    // than leaving it to the restaurant owner's own Settings page (same brandingProfile JSON
    // column devices.service.ts's tenant-scoped updateRestaurantIdentity() already writes to;
    // merged the same way, never replaced wholesale, so one side setting one field never wipes
    // out a field the other side set).
    branding: z
      .object({
        logoUrl: z.string().trim().url().max(500).optional(),
        primaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex color, e.g. #0B253A').optional(),
        accentColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex color, e.g. #E66817').optional(),
        displayName: z.string().trim().max(120).optional()
      })
      .strict()
      .optional()
  })
  // BUG-054: same GSTIN/FSSAI validation as create — see create-restaurant.dto.ts.
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
export type UpdateRestaurantDto = z.infer<typeof updateRestaurantSchema>;
