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
    (data) =>
      Boolean(data.settlementUpiVpa) ||
      Boolean(data.settlementAccountNumber && data.settlementIfsc && data.settlementAccountName),
    { message: 'Provide either a UPI VPA, or a settlement account name + account number + IFSC' }
  );
export type SubmitPaymentConnectionDto = z.infer<typeof submitPaymentConnectionSchema>;
