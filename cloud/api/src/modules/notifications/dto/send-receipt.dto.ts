import { z } from 'zod';

export const sendReceiptSchema = z.object({
  channel: z.enum(['WHATSAPP', 'SMS']),
  phoneNumber: z.string().regex(/^(\+?91)?[6-9]\d{9}$/, 'Must be a 10-digit Indian mobile number, optionally prefixed with +91'),
  templateParams: z.array(z.string().max(200)).min(0).max(10)
});

export type SendReceiptDto = z.infer<typeof sendReceiptSchema>;

export const emailReceiptSchema = z.object({
  // The local/external order id every kiosk order already carries, online or cash — see
  // ReceiptEmailService for how this resolves to either an online PaymentTransaction or a
  // cash-at-counter SyncedOrder row.
  orderId: z.string().min(1),
  email: z.string().trim().toLowerCase().email('Must be a valid email address').max(200)
});

export type EmailReceiptDto = z.infer<typeof emailReceiptSchema>;
