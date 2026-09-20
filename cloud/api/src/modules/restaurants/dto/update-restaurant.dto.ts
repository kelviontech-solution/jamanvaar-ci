import { z } from 'zod';
import { isValidGstinFormat, isValidFssaiFormat, gstinStateCodeMatches } from '../../../common/validation/gstin';

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
    timezone: z.string().trim().optional(),
    currency: z.string().trim().optional(),
    defaultLanguage: z.string().trim().optional()
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
