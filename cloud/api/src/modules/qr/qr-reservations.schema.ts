import { z } from 'zod';

export const createReservationSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    phone: z
      .string()
      .trim()
      .min(6)
      .max(20)
      .refine((v) => /^\+?[0-9 ()-]{6,20}$/.test(v), 'Enter a valid phone number'),
    date: z.string().refine((v) => !isNaN(Date.parse(v)) && /^\d{4}-\d{2}-\d{2}$/.test(v), 'Choose a valid date'),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Choose a valid time'),
    guests: z.number().int().min(1).max(50),
    note: z.string().trim().max(300).default('')
  })
  .strict();
export type CreateReservation = z.infer<typeof createReservationSchema>;

export const reservationActionSchema = z
  .object({ status: z.enum(['CONFIRMED', 'DECLINED', 'SEATED', 'CANCELLED']) })
  .strict();
export type ReservationAction = z.infer<typeof reservationActionSchema>;
