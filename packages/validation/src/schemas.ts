import { z } from 'zod';

export const DietaryTypeEnum = z.enum(['VEG', 'NON_VEG', 'JAIN', 'VEGAN', 'EGG']);
export const SpiceLevelEnum = z.enum(['NONE', 'MILD', 'MEDIUM', 'SPICY', 'EXTRA_SPICY']);
export const OrderTypeEnum = z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY', 'TOKEN_QR']);
export const PaymentMethodEnum = z.enum(['UPI_QR', 'CARD_TERMINAL', 'CASH_AT_COUNTER', 'WALLET', 'NET_BANKING']);

export const SelectedModifierSchema = z.object({
  groupId: z.string().min(1),
  groupName: z.string().min(1),
  optionId: z.string().min(1),
  optionName: z.string().min(1),
  priceDelta: z.number()
});

export const ModifierOptionSchema = z.object({
  id: z.string().min(1),
  groupId: z.string().min(1),
  name: z.string().min(1, 'Option name is required'),
  priceDelta: z.number().default(0),
  isDefault: z.boolean().optional(),
  isAvailable: z.boolean().default(true),
  sortOrder: z.number().default(0),
  dietaryType: DietaryTypeEnum.optional()
});

export const ModifierGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, 'Group name is required'),
  description: z.string().optional(),
  minSelections: z.number().int().min(0).default(0),
  maxSelections: z.number().int().min(1).default(1),
  isRequired: z.boolean().default(false),
  options: z.array(ModifierOptionSchema).default([]),
  sortOrder: z.number().default(0)
});

export const MenuItemSchema = z.object({
  id: z.string().min(1),
  categoryId: z.string().min(1, 'Category is required'),
  outletId: z.string().optional(),
  sku: z.string().min(1, 'SKU code is required'),
  name: z.string().min(1, 'Dish name is required'),
  description: z.string().default(''),
  price: z.number().positive('Price must be greater than 0'),
  imageUrl: z.string().optional(),
  dietaryType: DietaryTypeEnum.default('VEG'),
  spiceLevel: SpiceLevelEnum.default('NONE'),
  isPopular: z.boolean().default(false),
  isNew: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  isAvailable: z.boolean().default(true),
  soldOutReason: z.string().optional(),
  prepTimeMinutes: z.number().int().min(1).default(15),
  allergens: z.array(z.string()).default([]),
  modifierGroupIds: z.array(z.string()).default([]),
  taxGroupId: z.string().optional(),
  sortOrder: z.number().default(0),
  kitchenStation: z.string().default('Main Kitchen')
});

export const CategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, 'Category name is required'),
  slug: z.string().min(1),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  iconName: z.string().optional(),
  sortOrder: z.number().default(0),
  isActive: z.boolean().default(true)
});

export const CouponSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(2, 'Coupon code must be at least 2 characters').toUpperCase(),
  description: z.string().default(''),
  discountType: z.enum(['PERCENTAGE', 'FLAT']),
  discountValue: z.number().positive('Discount value must be positive'),
  minOrderValue: z.number().min(0).default(0),
  maxDiscountAmount: z.number().optional(),
  usageLimit: z.number().optional(),
  usageCount: z.number().default(0),
  validFrom: z.string(),
  validUntil: z.string(),
  isActive: z.boolean().default(true)
});

export const CreateOrderRequestSchema = z.object({
  idempotencyKey: z.string().min(5, 'Idempotency key required'),
  kioskId: z.string().min(1),
  sessionId: z.string().min(1),
  orderType: OrderTypeEnum,
  tableId: z.string().optional(),
  tableNumber: z.string().optional(),
  guestCount: z.number().int().min(1).optional(),
  customerPhone: z.string().regex(/^\d{10}$/, 'Phone number must be exactly 10 digits').optional().or(z.literal('')),
  customerName: z.string().optional(),
  paymentMethod: PaymentMethodEnum,
  notes: z.string().optional()
});
