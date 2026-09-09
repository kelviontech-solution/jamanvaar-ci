import { z } from 'zod';

const modifierOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  priceDelta: z.number().int() // paise
});

const modifierGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  isRequired: z.boolean().default(false),
  minSelections: z.number().int().min(0).default(0),
  maxSelections: z.number().int().min(0).default(0),
  options: z.array(modifierOptionSchema)
});

export const menuSyncItemSchema = z.object({
  externalItemId: z.string().min(1),
  name: z.string().min(1),
  category: z.string().optional(),
  basePrice: z.number().int().min(0), // paise
  modifierGroups: z.array(modifierGroupSchema).default([]),
  taxRate: z.number().int().min(0).default(0),
  isAvailable: z.boolean().default(true)
});

export const menuSyncSchema = z.object({
  items: z.array(menuSyncItemSchema).min(1).max(500)
});

export type MenuSyncDto = z.infer<typeof menuSyncSchema>;
export type MenuSyncItemDto = z.infer<typeof menuSyncItemSchema>;
