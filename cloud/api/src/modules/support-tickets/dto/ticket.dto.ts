import { z } from 'zod';

export const createTicketSchema = z.object({
  restaurantId: z.string().uuid().optional(),
  subject: z.string().trim().min(3),
  description: z.string().trim().min(3),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM')
});
export type CreateTicketDto = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assignedToId: z.string().uuid().nullable().optional()
});
export type UpdateTicketDto = z.infer<typeof updateTicketSchema>;

export const addCommentSchema = z.object({
  body: z.string().trim().min(1)
});
export type AddCommentDto = z.infer<typeof addCommentSchema>;
