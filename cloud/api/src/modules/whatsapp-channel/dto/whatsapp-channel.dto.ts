import { z } from 'zod';

// The frozen contract for the Jamanvaar ↔ WhatsApp connector (Phase 0 — scaffolding only,
// see docs/integrations/JAMANVAAR_WHATSAPP_CONNECTOR_IMPLEMENTATION_PLAN.md). Both repos
// build against these shapes; changing one after Phase 2 starts is a conversation between
// whoever owns each side first, not a unilateral edit (see that doc's §5).

// ---------------------------------------------------------------------------
// Tenant-facing (Restaurant Admin / pos-admin, behind TenantAuthGuard) — key lifecycle.
// ---------------------------------------------------------------------------

export const updateChannelSettingsSchema = z.object({
  autoAccept: z.boolean().optional(),
  prepTimeMinutes: z.number().int().min(0).max(180).optional(),
  paused: z.boolean().optional()
});
export type UpdateChannelSettingsDto = z.infer<typeof updateChannelSettingsSchema>;

// ---------------------------------------------------------------------------
// Service-to-service (product/whatsapp's backend, behind ServiceSignatureGuard).
// ---------------------------------------------------------------------------

export const validateKeySchema = z.object({
  // The raw key itself travels in the Authorization header (Bearer jmn_live_...), not
  // the body — same reason a password isn't put in a request body next to other fields.
});
export type ValidateKeyDto = z.infer<typeof validateKeySchema>;

export const channelQuoteSchema = z.object({
  // Optional, matching channels/menu's own branch-agnostic default (see
  // WhatsAppChannelService.getMenu's comment): product/whatsapp has no concept of a
  // Jamanvaar branch id today, so a single-branch restaurant (the common case) sends
  // none and the service resolves that restaurant's one branch itself. A multi-branch
  // restaurant not yet explicit about branch routing gets the same base menu/pricing
  // channels/menu already gives it in that case — a real, if imprecise, behavior worth
  // revisiting once the connector needs true multi-branch routing.
  branchId: z.string().uuid().optional(),
  cart: z
    .array(
      z.object({
        itemId: z.string().min(1),
        quantity: z.number().int().min(1).max(999),
        optionIds: z.array(z.string()).default([])
      })
    )
    .min(1)
});
export type ChannelQuoteDto = z.infer<typeof channelQuoteSchema>;

export const channelCheckoutSchema = channelQuoteSchema.extend({
  idempotencyKey: z.string().min(8).max(128),
  customer: z.object({
    name: z.string().min(1).max(200),
    phone: z.string().min(6).max(20),
    address: z.string().max(500).optional()
  }),
  orderType: z.enum(['PICKUP', 'DELIVERY', 'DINE_IN']),
  tableNumber: z.string().max(50).optional(),
  externalOrderId: z.string().min(1).max(128) // Vartalaap/whatsapp-side reference, carried through for correlation
});
export type ChannelCheckoutDto = z.infer<typeof channelCheckoutSchema>;
