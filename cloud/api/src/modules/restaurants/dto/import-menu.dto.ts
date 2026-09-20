import { z } from 'zod';

const menuEntitySchema = z.object({
  externalId: z.string().min(1).max(128),
  payload: z.record(z.string(), z.unknown())
});

export const importMenuSchema = z
  .object({
    categories: z.array(menuEntitySchema).max(1000).default([]),
    items: z.array(menuEntitySchema).max(2000).default([])
  })
  .refine((v) => v.categories.length > 0 || v.items.length > 0, {
    message: 'Provide at least one category or item to import'
  });
export type ImportMenuDto = z.infer<typeof importMenuSchema>;

export const menuPermissionSchema = z.object({
  enabled: z.boolean()
});
export type MenuPermissionDto = z.infer<typeof menuPermissionSchema>;
