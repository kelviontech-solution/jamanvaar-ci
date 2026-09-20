import { z } from 'zod';

export const TICKET_CATEGORIES = ['BILLING', 'SYNC', 'HARDWARE', 'ONBOARDING', 'FEATURE_REQUEST', 'OTHER'] as const;
const categorySchema = z.enum(TICKET_CATEGORIES);

const subjectSchema = z.string().trim().min(3, 'Subject must be at least 3 characters').max(200);
const descriptionSchema = z.string().trim().min(3, 'Description must be at least 3 characters').max(5000);
const prioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

export const createTicketSchema = z.object({
  restaurantId: z.string().uuid().optional(),
  subject: subjectSchema,
  description: descriptionSchema,
  category: categorySchema.default('OTHER'),
  priority: prioritySchema.default('MEDIUM'),
  assignedToId: z.string().uuid().nullable().optional()
});
export type CreateTicketDto = z.infer<typeof createTicketSchema>;

/** What a restaurant may send: its own restaurant is taken from the session, never from the body. */
export const tenantCreateTicketSchema = z.object({
  subject: subjectSchema,
  description: descriptionSchema,
  category: categorySchema.default('OTHER'),
  priority: prioritySchema.default('MEDIUM'),
  branchId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional()
});
export type TenantCreateTicketDto = z.infer<typeof tenantCreateTicketSchema>;

export const updateTicketSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
  priority: prioritySchema.optional(),
  category: categorySchema.optional(),
  assignedToId: z.string().uuid().nullable().optional()
});
export type UpdateTicketDto = z.infer<typeof updateTicketSchema>;

export const addCommentSchema = z.object({
  body: z.string().trim().min(1, 'Write a message first').max(5000),
  /** Platform team only: an internal note the restaurant never sees. */
  internal: z.boolean().optional()
});
export type AddCommentDto = z.infer<typeof addCommentSchema>;

export const tenantCommentSchema = z.object({
  body: z.string().trim().min(1, 'Write a message first').max(5000)
});

export const ATTACHMENT_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'text/plain'] as const;
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_TICKET = 5;

export const attachmentSchema = z.object({
  fileName: z.string().trim().min(1, 'File name is required').max(120).regex(/^[^\\/\0]+$/, 'File name cannot contain slashes'),
  mimeType: z.enum(ATTACHMENT_MIME_TYPES, { errorMap: () => ({ message: 'Only images (PNG, JPEG, WebP, GIF), PDF and plain text files can be attached' }) }),
  dataBase64: z.string().min(1, 'The file is empty')
});
export type AttachmentDto = z.infer<typeof attachmentSchema>;
