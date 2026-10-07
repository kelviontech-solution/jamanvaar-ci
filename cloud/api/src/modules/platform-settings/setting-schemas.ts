import { z } from 'zod';
import { gstinStateCodeMatches, isValidGstinFormat } from '../../common/validation/gstin';
import { DEFAULT_WELCOME_POLICY, welcomePolicySchema } from './welcome-policy';

const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'must be a valid date-time');

/**
 * The shape and limits of every editable platform setting. Anything not listed here
 * cannot be written (the API used to store any JSON for any existing key).
 */
export const SETTING_SCHEMAS: Record<string, z.ZodTypeAny> = {
  'platform.kioskWelcome': welcomePolicySchema,
  'platform.branding': z.object({
    platformName: z.string().trim().min(1, 'Platform name is required').max(80),
    companyName: z.string().trim().min(1, 'Company name is required').max(80),
    supportEmail: z.string().trim().email('Support email must be a valid email address').max(120),
    supportPhone: z.string().trim().max(32)
  }),
  /** Who appears as the seller on invoices and receipts. */
  'platform.billing': z
    .object({
      tradeName: z.string().trim().min(1, 'Trade name is required').max(80),
      legalName: z.string().trim().min(1, 'Legal name is required').max(120),
      address: z.string().trim().max(200),
      city: z.string().trim().max(80),
      state: z.string().trim().min(1, 'State is required (it decides CGST + SGST or IGST)').max(60),
      country: z.string().trim().min(1).max(60),
      pincode: z.string().trim().regex(/^(\d{6})?$/, 'PIN code must be 6 digits'),
      gstin: z.string().trim().toUpperCase().refine((v) => v === '' || isValidGstinFormat(v), 'GSTIN is not a valid 15-character GST number'),
      /** The seller's PAN (10 characters, e.g. AAACK7890F); optional. */
      panNumber: z.string().trim().toUpperCase().regex(/^([A-Z]{5}[0-9]{4}[A-Z])?$/, 'PAN must look like AAACK7890F').optional().default(''),
      sacCode: z.string().trim().regex(/^\d{4,8}$/, 'SAC code must be 4 to 8 digits'),
      sacDescription: z.string().trim().max(160),
      bankName: z.string().trim().max(80),
      bankAccountName: z.string().trim().max(120),
      bankAccountNumber: z.string().trim().regex(/^(\d{6,20})?$/, 'Account number must be 6 to 20 digits'),
      bankIfsc: z.string().trim().toUpperCase().regex(/^([A-Z]{4}0[A-Z0-9]{6})?$/, 'IFSC must look like HDFC0001234'),
      upiId: z.string().trim().regex(/^([\w.\-]{2,}@[\w.\-]{2,})?$/, 'UPI ID must look like name@bank'),
      /** Where invoice questions go; the branding support email is used when this is empty. */
      billingEmail: z.string().trim().max(120).refine((v) => v === '' || z.string().email().safeParse(v).success, 'Billing email must be a valid email address')
    })
    .refine((v) => !v.gstin || gstinStateCodeMatches(v.gstin, v.state), { message: "The GSTIN's state code does not match the state", path: ['gstin'] }),
  'platform.defaults': z.object({
    trialDurationDays: z.number().int().min(1).max(365),
    maxTrialBranches: z.number().int().min(1).max(100),
    maxTrialDevices: z.number().int().min(1).max(500),
    defaultCurrency: z.string().trim().length(3, 'Currency must be a 3-letter code').toUpperCase()
  }),
  'platform.maintenance': z
    .object({
      maintenanceMode: z.boolean(),
      statusBanner: z.string().trim().max(500),
      /** Optional window. Outside it the notice is not shown even when the switch is on. */
      startsAt: isoDate.nullish(),
      endsAt: isoDate.nullish()
    })
    .refine((v) => !v.startsAt || !v.endsAt || Date.parse(v.endsAt) > Date.parse(v.startsAt), {
      message: 'The end time must be after the start time',
      path: ['endsAt']
    })
};

/**
 * The values a fresh install starts with (same as prisma/seed.ts). Updates merge over these, so a row
 * that an older, unvalidated API left with missing fields is repaired by the next valid save.
 */
export const SETTING_DEFAULTS: Record<string, Record<string, unknown>> = {
  'platform.kioskWelcome': DEFAULT_WELCOME_POLICY,
  'platform.branding': {
    platformName: 'JAMANVAAR SaaS Control Plane',
    companyName: 'Kelviontech',
    supportEmail: 'support@jamanvaar.app',
    supportPhone: ''
  },
  // The values invoices carried before this was editable; replace them with the real company's details.
  'platform.billing': {
    tradeName: 'JAMANVAAR SaaS Platform',
    legalName: 'KELVIONTECH PRIVATE LIMITED',
    address: 'Plot 42, Science City Road, Sola',
    city: 'Ahmedabad',
    state: 'Gujarat',
    country: 'India',
    pincode: '380060',
    gstin: '24AAACK7890F1ZT',
    panNumber: '',
    sacCode: '997331',
    sacDescription: 'Cloud SaaS Platform Subscription & Technical Support',
    bankName: 'HDFC Bank Ltd',
    bankAccountName: 'KELVIONTECH PRIVATE LIMITED',
    bankAccountNumber: '50200088991122',
    bankIfsc: 'HDFC0001234',
    upiId: 'jamanvaar@hdfcbank',
    billingEmail: ''
  },
  'platform.defaults': { trialDurationDays: 14, maxTrialBranches: 1, maxTrialDevices: 5, defaultCurrency: 'INR' },
  'platform.maintenance': { maintenanceMode: false, statusBanner: '', startsAt: null, endsAt: null }
};
