import { z } from 'zod';

export const createInvoiceSchema = z.object({
  restaurantId: z.string().uuid(),
  subscriptionId: z.string().uuid().optional(),
  planId: z.string().min(1).optional(),
  amount: z.number().int().positive(), // in paise
  taxAmount: z.number().int().nonnegative().default(0), // in paise
  dueDate: z.coerce.date(),
  billingPeriodStart: z.coerce.date(),
  billingPeriodEnd: z.coerce.date(),
  notes: z.string().optional()
});

export type CreateInvoiceDto = z.infer<typeof createInvoiceSchema>;

export const recordPaymentSchema = z.object({
  amount: z.number().int().positive(), // in paise
  method: z.enum(['MANUAL', 'BANK_TRANSFER', 'UPI', 'CARD', 'CHEQUE', 'GATEWAY']).default('BANK_TRANSFER'),
  referenceNumber: z.string().optional(),
  notes: z.string().optional()
});

export type RecordPaymentDto = z.infer<typeof recordPaymentSchema>;

export const updateInvoiceStatusSchema = z
  .object({
    status: z.enum(['DRAFT', 'ISSUED', 'PAID', 'PAST_DUE', 'VOID', 'REFUNDED']),
    reason: z.string().trim().min(5).max(500).optional()
  })
  .refine((v) => !['VOID', 'REFUNDED'].includes(v.status) || !!v.reason, {
    message: 'A reason (at least 5 characters) is required to void or refund an invoice',
    path: ['reason']
  });

export type UpdateInvoiceStatusDto = z.infer<typeof updateInvoiceStatusSchema>;

export const tenantPaymentSchema = z.object({
  method: z.enum(['MANUAL', 'BANK_TRANSFER', 'UPI', 'CARD', 'CHEQUE', 'GATEWAY']).default('UPI'),
  referenceNumber: z.string().optional(),
  amount: z.number().int().positive().optional(),
  notes: z.string().optional()
});

export type TenantPaymentDto = z.infer<typeof tenantPaymentSchema>;

