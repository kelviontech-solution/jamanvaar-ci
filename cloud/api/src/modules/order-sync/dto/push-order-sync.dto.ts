import { z } from 'zod';

// This bridge mirrors the order as POS/KDS/Captain already agreed on it
// locally — unlike payments' createPaymentOrderSchema, there is no
// MenuSnapshotItem-equivalent cloud menu for the general order domain yet
// (packages/database/src/schema.ts's menu tables are local-only), so the
// totals the device sends are trusted as-is. This is an operational mirror
// for cross-device visibility, not a payment-authoritative record.
export const syncedOrderItemSchema = z.object({
  externalItemId: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().int().min(1).max(999),
  unitPrice: z.number().int().min(0),
  modifiers: z.array(z.string()).default([]),
  kitchenStatus: z.string().optional(),
  lineTotal: z.number().int().min(0)
});

export const orderSyncEventSchema = z.object({
  externalOrderId: z.string().min(1).max(64),
  orderType: z.string().min(1).max(32),
  status: z.string().min(1).max(32),
  tableId: z.string().max(64).optional(),
  tableLabel: z.string().max(64).optional(),
  items: z.array(syncedOrderItemSchema).min(1).max(200),
  subtotal: z.number().int().min(0),
  taxAmount: z.number().int().min(0),
  discountAmount: z.number().int().min(0).default(0),
  totalAmount: z.number().int().min(0),
  notes: z.string().max(2000).optional(),
  updatedAt: z.string().datetime()
});

export const pushOrderSyncSchema = z.object({
  events: z.array(orderSyncEventSchema).min(1).max(100)
});

export type OrderSyncEventDto = z.infer<typeof orderSyncEventSchema>;
export type PushOrderSyncDto = z.infer<typeof pushOrderSyncSchema>;
