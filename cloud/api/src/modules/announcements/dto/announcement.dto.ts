import { z } from 'zod';

export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4000),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).default('INFO'),
  /// ISO date string; omit for "stays visible until withdrawn".
  expiresAt: z.string().datetime().optional()
});
export type CreateAnnouncementDto = z.infer<typeof createAnnouncementSchema>;
