import { z } from 'zod';

// `password` is optional at the schema level and enforced by requireStepUpPassword() in the
// service (see commission-config.dto.ts): missing and wrong are both a 403.
export const adminRefundSchema = z.object({
  amountPaise: z.number().int().min(1),
  reason: z.string().trim().min(1).max(500),
  method: z.enum(['CASH', 'UPI_TO_CUSTOMER']),
  password: z.string().min(1).optional()
});
export type AdminRefundDto = z.infer<typeof adminRefundSchema>;

