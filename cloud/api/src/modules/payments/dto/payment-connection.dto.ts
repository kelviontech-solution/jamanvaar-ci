import { z } from 'zod';

export const submitPaymentConnectionSchema = z
  .object({
    accountType: z.enum(['BUSINESS', 'INDIVIDUAL']),
    businessType: z.string().trim().min(1).optional(),
    pan: z.string().trim().min(1),
    gst: z.string().trim().optional(),
    cin: z.string().trim().optional(),
    uidai: z.string().trim().optional(),
    contactName: z.string().trim().min(1),
    contactEmail: z.string().trim().toLowerCase().email(),
    contactPhone: z.string().trim().min(8).max(12),
    settlementAccountName: z.string().trim().min(1).optional(),
    settlementAccountNumber: z.string().trim().min(1).optional(),
    settlementIfsc: z.string().trim().min(1).optional(),
    settlementUpiVpa: z.string().trim().min(1).optional()
  })
  .refine(
    (data) => {
      const hasUpi = Boolean(data.settlementUpiVpa);
      const hasBank = Boolean(data.settlementAccountNumber && data.settlementIfsc && data.settlementAccountName);
      return hasUpi !== hasBank; // exactly one, matching the bank-or-UPI payout rule of Razorpay Route
    },
    { message: 'Provide either a UPI VPA, or a settlement account name + account number + IFSC — not both' }
  );
export type SubmitPaymentConnectionDto = z.infer<typeof submitPaymentConnectionSchema>;

export const settlementPreferenceSchema = z.object({ directSettlementRequested: z.boolean() }).strict();
export type SettlementPreferenceDto = z.infer<typeof settlementPreferenceSchema>;

export const settlementBankDetailsSchema = z.object({
  settlementAccountName: z.string().trim().min(1).max(120),
  settlementBankName: z.string().trim().min(1).max(120),
  settlementAccountNumber: z.string().trim().regex(/^\d{6,34}$/, 'Enter a valid bank account number'),
  settlementIfsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC'),
  settlementBankAccountType: z.enum(['SAVINGS', 'CURRENT'])
}).strict();
export type SettlementBankDetailsDto = z.infer<typeof settlementBankDetailsSchema>;
