import { z } from 'zod';

export const createFeatureCategorySchema = z.object({
  code: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1),
  sortOrder: z.number().int()
});
export type CreateFeatureCategoryDto = z.infer<typeof createFeatureCategorySchema>;

export const updateFeatureCategorySchema = z.object({
  code: z.undefined({ error: 'code is immutable once created' }).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().optional()
});
export type UpdateFeatureCategoryDto = z.infer<typeof updateFeatureCategorySchema>;
