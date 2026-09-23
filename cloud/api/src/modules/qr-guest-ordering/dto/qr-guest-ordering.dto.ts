import { z } from 'zod';

// A guest's phone identifies itself only by the token printed on the table's QR code — never a login, never a
// device credential (BUG-119). The token itself is the whole security boundary: high-entropy, unique per
// table, resolved server-side against QrTableLink before anything else runs.
export const qrGuestTokenSchema = z.string().trim().min(10).max(200);

export const qrGuestSessionQuerySchema = z.object({
  token: qrGuestTokenSchema
});
export type QrGuestSessionQuery = z.infer<typeof qrGuestSessionQuerySchema>;

export const qrGuestOrderLineSchema = z.object({
  externalItemId: z.string().min(1).max(128),
  quantity: z.number().int().min(1).max(50),
  selectedOptionIds: z.array(z.string().max(128)).max(30).default([]),
  specialInstructions: z.string().max(300).optional()
});

export const placeQrGuestOrderSchema = z.object({
  token: qrGuestTokenSchema,
  items: z.array(qrGuestOrderLineSchema).min(1).max(50),
  // v1 is pay-at-counter only (BUG-119): a public, unauthenticated endpoint is not where a first cut of this
  // feature should also integrate a payment gateway. CASH_AT_COUNTER is the true state until the cashier
  // settles it — the existing "unpaid open order is not a sale" rule (BUG-151) already covers this correctly.
  paymentMethod: z.literal('CASH_AT_COUNTER').default('CASH_AT_COUNTER'),
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{6,20}$/)
    .optional(),
  orderNotes: z.string().max(500).optional(),
  // The guest's own browser generates this once per cart and resends it on a retry (a flaky mobile network is
  // the normal case here, not the exception) - the SAME idempotency shape order-sync already relies on
  // (externalOrderId doubles as the idempotency key), just guest-generated instead of terminal-generated.
  idempotencyKey: z.string().trim().min(8).max(80)
});
export type PlaceQrGuestOrderDto = z.infer<typeof placeQrGuestOrderSchema>;

export const qrGuestOrderStatusQuerySchema = z.object({
  token: qrGuestTokenSchema
});
