import { z } from 'zod';

// No status field, no client-sent "is this valid" trust — the service
// layer re-validates the amount against what's actually still refundable.
export const createRefundSchema = z.object({
  amountPaise: z.number().int().min(1),
  reason: z.string().min(1).max(500)
});

export type CreateRefundDto = z.infer<typeof createRefundSchema>;
