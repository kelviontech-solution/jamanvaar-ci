import { z } from 'zod';

export const setBankVerificationSchema = z.object({
  status: z.enum(['VERIFIED', 'REJECTED']),
  password: z.string().min(1).optional()
});
export type SetBankVerificationDto = z.infer<typeof setBankVerificationSchema>;

export const markPayoutPaidSchema = z.object({
  utr: z.string().trim().min(1, 'A UTR / transfer reference is required'),
  password: z.string().min(1).optional()
});
export type MarkPayoutPaidDto = z.infer<typeof markPayoutPaidSchema>;

export const holdPayoutSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  password: z.string().min(1).optional()
});
export type HoldPayoutDto = z.infer<typeof holdPayoutSchema>;

export const releasePayoutSchema = z.object({
  password: z.string().min(1).optional()
});
export type ReleasePayoutDto = z.infer<typeof releasePayoutSchema>;

export const runEodBatchSchema = z.object({
  businessDate: z
    .string()
    .regex(/^\d{8}$/, 'businessDate must be YYYYMMDD')
    .optional()
});
export type RunEodBatchDto = z.infer<typeof runEodBatchSchema>;
