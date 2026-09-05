import { z } from 'zod';

export const updateOwnerSchema = z.object({
  fullName: z.string().trim().min(2).optional(),
  phone: z.string().trim().optional()
});
export type UpdateOwnerDto = z.infer<typeof updateOwnerSchema>;
