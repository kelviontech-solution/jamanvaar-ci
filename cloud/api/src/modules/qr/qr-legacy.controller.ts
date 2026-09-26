import { Body, Controller, Get, Param, Post, Query, UseInterceptors, UsePipes } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { QrRateLimitInterceptor } from './qr-rate-limit';
import { QrPublicService, placeQrOrderSchema } from './qr-public.service';
import { QR_TOKEN_PATTERN } from './qr.support';

/**
 * Deprecated adapter for the guest page that older printed QR codes still open (`/api/v1/qr-guest/*`). It contains
 * no logic of its own: every call is the new public service under the old request and response shapes, so the same
 * authorization, pricing, idempotency and sequencing apply. Removed once no active code uses the old page (plan P12).
 */
const legacyOrderSchema = z
  .object({
    token: z.string().regex(QR_TOKEN_PATTERN),
    items: z.array(z.object({ externalItemId: z.string().min(1).max(128), quantity: z.number().int().min(1).max(50), selectedOptionIds: z.array(z.string().max(128)).max(30).default([]), specialInstructions: z.string().max(300).optional() }).strict()).min(1).max(50),
    paymentMethod: z.literal('CASH_AT_COUNTER').default('CASH_AT_COUNTER'),
    customerName: z.string().trim().max(120).optional(),
    customerPhone: z.string().trim().regex(/^[0-9+\-\s]{6,20}$/).optional(),
    orderNotes: z.string().max(500).optional(),
    idempotencyKey: z.string().trim().min(8).max(80)
  })
  .strict();

@SkipThrottle()
@UseInterceptors(QrRateLimitInterceptor)
@Controller('api/v1/qr-guest')
export class QrLegacyGuestController {
  constructor(private readonly qr: QrPublicService) {}

  @Get('session')
  async session(@Query('token') token: string) {
    const [info, menu] = await Promise.all([this.qr.describe(token ?? ''), this.qr.menu(token ?? '')]);
    return {
      restaurant: { name: info.restaurant.name },
      table: { tableNumber: info.table?.displayNumber ?? '', capacity: info.table?.capacity },
      categories: menu.categories,
      items: menu.items.map((i) => ({ externalItemId: i.id, name: i.name, description: i.description, categoryId: i.categoryId, price: i.price, imageUrl: i.imageUrl, dietaryType: i.dietaryType, isAvailable: true, modifierGroupIds: i.modifierGroupIds })),
      modifierGroups: menu.modifierGroups.map((g) => ({ ...g, options: g.options.map((o) => ({ ...o, priceDelta: Math.round(o.priceDelta * 100) })) }))
    };
  }

  @Post('orders')
  @UsePipes(new ZodValidationPipe(legacyOrderSchema))
  async place(@Body() body: z.infer<typeof legacyOrderSchema>) {
    const { token, items, ...rest } = body;
    const dto = placeQrOrderSchema.parse({ ...rest, items: items.map((i) => ({ itemId: i.externalItemId, quantity: i.quantity, optionIds: i.selectedOptionIds, note: i.specialInstructions })) });
    const placed = await this.qr.placeOrder(token, dto);
    return { externalOrderId: placed.publicOrderId, tokenNumber: placed.orderNumber ?? '', totalAmount: placed.total, status: placed.status };
  }

  @Get('orders/:publicOrderId')
  async status(@Param('publicOrderId') publicOrderId: string) {
    const s = await this.qr.orderStatus(publicOrderId);
    return { status: s.status, tokenNumber: s.orderNumber };
  }
}
