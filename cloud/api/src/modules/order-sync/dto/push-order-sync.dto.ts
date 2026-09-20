import { z } from 'zod';

// This bridge mirrors the order as POS/KDS/Captain/Restaurant Admin already
// agreed on it locally - unlike payments' createPaymentOrderSchema, there is no
// MenuSnapshotItem-equivalent cloud menu for the general order domain yet
// (packages/database/src/schema.ts's menu tables are local-only), so the
// totals the device sends are trusted as-is. This is an operational mirror
// for cross-device visibility, not a payment-authoritative record.
// All money is in paise (integers).
export const syncedOrderItemSchema = z.object({
  externalItemId: z.string().min(1),
  menuItemId: z.string().max(128).optional(),
  name: z.string().min(1),
  quantity: z.number().int().min(1).max(999),
  unitPrice: z.number().int().min(0),
  modifiers: z.array(z.string()).default([]),
  modifierDetails: z.array(z.object({ optionName: z.string(), priceDelta: z.number().int() })).optional(),
  kitchenStatus: z.string().optional(),
  kitchenStation: z.string().max(64).optional(),
  specialInstructions: z.string().max(500).optional(),
  lineTotal: z.number().int().min(0)
});

export const orderSyncMetaSchema = z
  .object({
    orderNumber: z.string().max(64).optional(),
    tokenNumber: z.string().max(32).optional(),
    cashierName: z.string().max(120).optional(),
    captainName: z.string().max(120).optional(),
    customerName: z.string().max(120).optional(),
    customerPhone: z.string().max(32).optional(),
    guestCount: z.number().int().min(0).max(1000).optional(),
    createdAt: z.string().optional(),
    sourceType: z.string().max(32).optional(),
    businessDayId: z.string().max(64).optional(),
    paymentTransactionId: z.string().max(128).optional(),
    tenderedAmountPaise: z.number().int().optional(),
    paymentSplits: z.array(z.object({ method: z.string().max(32), amountPaise: z.number().int() })).optional(),
    cgstPaise: z.number().int().optional(),
    sgstPaise: z.number().int().optional(),
    roundOffPaise: z.number().int().optional(),
    serviceChargePaise: z.number().int().optional(),
    tipPaise: z.number().int().optional()
  })
  .strip();

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
  paymentStatus: z.string().max(32).optional(),
  paymentMethod: z.string().max(32).optional(),
  meta: orderSyncMetaSchema.optional(),
  updatedAt: z.string().datetime()
});

// The outer request only checks that events is a list. Each event is validated
// on its own inside OrderSyncService, so ONE malformed order is reported as an
// error for that order and never blocks the rest of the batch (it used to
// reject the whole request, and the device retried the same batch forever).
export const pushOrderSyncSchema = z.object({
  events: z.array(z.unknown()).min(1).max(100)
});

export type OrderSyncEventDto = z.infer<typeof orderSyncEventSchema>;
export type PushOrderSyncDto = z.infer<typeof pushOrderSyncSchema>;
