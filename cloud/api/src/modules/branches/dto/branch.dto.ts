import { z } from 'zod';

export const createBranchSchema = z.object({
  restaurantId: z.string().uuid(),
  name: z.string().trim().min(2, 'Branch name is required'),
  code: z
    .string()
    .trim()
    .min(2, 'Branch code is required')
    .transform((v) => v.toUpperCase()),
  address: z.string().trim().optional(),
  timezone: z.string().trim().default('Asia/Kolkata')
});
export type CreateBranchDto = z.infer<typeof createBranchSchema>;

export const updateBranchSchema = z.object({
  name: z.string().trim().min(2).optional(),
  address: z.string().trim().optional(),
  timezone: z.string().trim().optional()
});
export type UpdateBranchDto = z.infer<typeof updateBranchSchema>;

export const bulkBranchStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'Choose at least one branch').max(200),
  status: z.enum(['ACTIVE', 'INACTIVE'])
});
