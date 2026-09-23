import { z } from 'zod';

// No status field, no client-sent "is this valid" trust — the service
// layer re-validates the amount against what's actually still refundable.
export const createRefundSchema = z.object({
  amountPaise: z.number().int().min(1),
  reason: z.string().min(1).max(500),
  // security-audit LOW-02: the terminal authenticates with a device token
  // only (the cloud has no notion of the local staff identity that
  // authorized this on the POS UI's own manager-approval prompt) — this is
  // the staff/manager name that approval was captured under, carried through
  // so the refund isn't otherwise unattributed in Refund.requestedBy/the
  // audit log. Client-asserted, same trust level as every other staff-name
  // field this terminal already sends (e.g. order.cashierName).
  requestedBy: z.string().trim().min(1, 'requestedBy is required').max(200)
});

export type CreateRefundDto = z.infer<typeof createRefundSchema>;
