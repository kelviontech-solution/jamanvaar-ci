import { kioskConfigurationSchema } from './kiosk-configuration-schema';
import { z } from 'zod';

/**
 * What the published menu relies on, checked when a menu record is pushed (not only when it is published), so a bad edit is
 * refused where it is made and never reaches guests. Deliberately permissive about everything else: devices carry many
 * app-specific fields, and unknown ones pass through untouched. A record that is being deleted is never validated.
 */
const money = z.number().finite().min(0).max(1_000_000);
const percent = z.number().finite().min(0).max(100);
const text = (max: number) => z.string().max(max);
const nonEmpty = (max: number) => z.string().trim().min(1).max(max);
const IMAGE = z.string().max(4_000_000); // an inline picture is re-checked (type, size, bytes) at publish

const menuItem = z
  .object({
    name: nonEmpty(200),
    price: money.optional(),
    categoryId: text(128).optional(),
    description: text(2000).optional(),
    imageUrl: IMAGE.optional(),
    taxGroupId: text(128).nullable().optional(),
    modifierGroupIds: z.array(text(128)).max(50).optional(),
    salesChannels: z.array(z.enum(['POS', 'KIOSK', 'QR', 'CAPTAIN'])).max(4).optional(),
    branchIds: z.array(text(128)).max(200).optional(),
    minQuantity: z.number().int().min(1).max(50).optional(),
    maxQuantity: z.number().int().min(1).max(50).optional(),
    sortOrder: z.number().finite().optional(),
    isAvailable: z.boolean().optional(),
    isQrOrderingEnabled: z.boolean().optional(),
    allowInstructions: z.boolean().optional()
  })
  .passthrough()
  .refine((v) => v.minQuantity === undefined || v.maxQuantity === undefined || v.minQuantity <= v.maxQuantity, { message: 'minQuantity cannot exceed maxQuantity' });

const category = z.object({ name: nonEmpty(120), description: text(1000).optional(), imageUrl: IMAGE.optional(), sortOrder: z.number().finite().optional(), isActive: z.boolean().optional(), qrVisible: z.boolean().optional() }).passthrough();

const modifierOption = z.object({ id: nonEmpty(128), name: nonEmpty(120), priceDelta: money, isAvailable: z.boolean().optional(), isDefault: z.boolean().optional(), description: text(500).optional(), imageUrl: IMAGE.optional() }).passthrough();
const modifierGroup = z
  .object({
    name: nonEmpty(120),
    description: text(500).optional(),
    minSelections: z.number().int().min(0).max(50).optional(),
    maxSelections: z.number().int().min(0).max(50).optional(),
    isRequired: z.boolean().optional(),
    options: z.array(modifierOption).max(100)
  })
  .passthrough()
  .refine((g) => !g.maxSelections || g.minSelections === undefined || g.minSelections <= g.maxSelections, { message: 'minSelections cannot exceed maxSelections' });

const taxGroup = z.object({ name: nonEmpty(120), cgstPercent: percent.optional(), sgstPercent: percent.optional(), igstPercent: percent.optional(), isInclusive: z.boolean().optional(), isActive: z.boolean().optional() }).passthrough();

const diningTable = z
  .object({
    tableNumber: nonEmpty(20),
    capacity: z.number().int().min(1).max(200).optional(),
    status: z.enum(['AVAILABLE', 'OCCUPIED', 'RESERVED', 'BILLING', 'BILL_REQUESTED', 'CLEANING', 'BLOCKED']).optional(),
    zone: text(60).optional(),
    branchId: text(128).optional()
  })
  .passthrough();

const SCHEMAS: Record<string, z.ZodTypeAny> = { KIOSK_CONFIGURATION: kioskConfigurationSchema, DINING_TABLE: diningTable, MENU_ITEM: menuItem, MENU_CATEGORY: category, MODIFIER_GROUP: modifierGroup, TAX_GROUP: taxGroup };

/** A readable reason when the record is not acceptable, otherwise null. */
export function menuEntityProblem(entityType: string, payload: Record<string, unknown>): string | null {
  const schema = SCHEMAS[entityType];
  if (!schema || payload.deleted === true) return null;
  const r = schema.safeParse(payload);
  if (r.success) return null;
  const i = r.error.issues[0];
  return `${entityType} rejected: ${i.path.length ? i.path.join('.') + ' ' : ''}${i.message}`;
}
