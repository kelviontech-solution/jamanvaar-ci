import { z } from 'zod';

export const createIncidentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  severity: z.enum(['MINOR', 'MAJOR', 'CRITICAL']).default('MINOR'),
  message: z.string().trim().min(1).max(2000)
});
export type CreateIncidentDto = z.infer<typeof createIncidentSchema>;

export const addIncidentUpdateSchema = z.object({
  status: z.enum(['INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED']),
  message: z.string().trim().min(1).max(2000)
});
export type AddIncidentUpdateDto = z.infer<typeof addIncidentUpdateSchema>;
