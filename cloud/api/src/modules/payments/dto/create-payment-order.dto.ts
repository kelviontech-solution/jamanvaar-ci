import { z } from 'zod';

export const cartLineSchema = z.object({
  externalItemId: z.string().min(1),
  quantity: z.number().int().min(1).max(50),
  selectedOptionIds: z.array(z.string()).default([])
});

// No amount field on purpose — the backend computes it from MenuSnapshotItem,
// never trusting a client-sent total.
export const createPaymentOrderSchema = z.object({
  externalOrderId: z.string().min(1).max(64),
  lines: z.array(cartLineSchema).min(1).max(100)
});

export type CreatePaymentOrderDto = z.infer<typeof createPaymentOrderSchema>;
export type CartLineDto = z.infer<typeof cartLineSchema>;
