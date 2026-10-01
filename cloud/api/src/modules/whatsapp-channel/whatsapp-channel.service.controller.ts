import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Res, UseGuards, UsePipes } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { WhatsAppChannelService } from './whatsapp-channel.service';
import { ServiceSignatureGuard } from '../../common/guards/service-signature.guard';
import { ChannelCheckoutDto, ChannelQuoteDto, channelCheckoutSchema, channelQuoteSchema } from './dto/whatsapp-channel.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

/**
 * Phase 7 rate-limit trackers (see app.module.ts's ThrottlerModule.forRoot for the
 * matching limit/ttl of each named throttler below). Every route here is called by one
 * shared backend server (product/whatsapp) on behalf of however many restaurants are
 * connected, so the global default throttler's per-IP tracking would bucket all of them
 * together -- these track per-restaurant instead, so one restaurant's bug or abuse can't
 * exhaust another's budget. Never throws: an unparseable/missing field here must degrade
 * to a safe fallback, not break the request before the real auth/validation layers run.
 */
function restaurantTracker(req: Record<string, any>): string {
  const restaurantId = req.query?.restaurantId;
  return typeof restaurantId === 'string' && restaurantId ? restaurantId : req.ip;
}

/** checkout only: scoped to the one customer a payment link would actually be sent to,
 *  so a bug or a malicious actor can't spam one person's WhatsApp with repeat payment
 *  links even while staying under the restaurant-wide checkout cap. The body hasn't
 *  passed channelCheckoutSchema yet at guard time (pipes run after guards), so this reads
 *  it defensively -- a missing/malformed phone just falls back to the restaurant tracker,
 *  which still applies its own (looser) cap. */
function checkoutCustomerTracker(req: Record<string, any>): string {
  const restaurantId = restaurantTracker(req);
  const phone = req.body?.customer?.phone;
  if (typeof phone !== 'string' || !phone) return restaurantId;
  return `${restaurantId}:${phone.replace(/\D/g, '')}`;
}

/**
 * Called by product/whatsapp's backend only — never a browser, never a login. See
 * common/guards/service-signature.guard.ts for the auth model.
 *
 * Phase 0-4 scope: key lifecycle, validate-key, channels/menu, quote, checkout and order status
 * are all real — see docs/integrations/JAMANVAAR_WHATSAPP_CONNECTOR_IMPLEMENTATION_PLAN.md.
 */
@Controller('api/v1/service/whatsapp-channel')
@UseGuards(ServiceSignatureGuard)
export class ServiceWhatsAppChannelController {
  constructor(private readonly channel: WhatsAppChannelService) {}

  @Post('validate-key')
  @Throttle({ whatsappValidateKey: { limit: 30, ttl: 60_000 } })
  validateKey(@Body('key') key: string) {
    return this.channel.validateKey(key);
  }

  @Get('channels/menu')
  @Throttle({ whatsappSvc: { limit: 90, ttl: 60_000, getTracker: restaurantTracker } })
  async getMenu(
    @Query('restaurantId') restaurantId: string,
    @Query('branchId') branchId: string | undefined,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: Response
  ) {
    const menu = await this.channel.getMenu(restaurantId, branchId ?? null);
    // Same ETag/304 contract qr.controllers.ts's own menu route already uses — a
    // second client (or a poll after nothing changed) costs a cache lookup, not a
    // full menu re-send.
    res.setHeader('ETag', `"${menu.etag}"`);
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    if (ifNoneMatch === `"${menu.etag}"`) {
      res.status(304);
      return;
    }
    return menu;
  }

  @Post('channels/quote')
  @UsePipes(new ZodValidationPipe(channelQuoteSchema))
  @HttpCode(200)
  @Throttle({ whatsappSvc: { limit: 90, ttl: 60_000, getTracker: restaurantTracker } })
  quote(@Query('restaurantId') restaurantId: string, @Body() body: ChannelQuoteDto) {
    return this.channel.quote(restaurantId, body);
  }

  @Post('channels/checkout')
  @UsePipes(new ZodValidationPipe(channelCheckoutSchema))
  @Throttle({
    whatsappCheckout: { limit: 20, ttl: 60_000, getTracker: restaurantTracker },
    whatsappCheckoutPerCustomer: { limit: 5, ttl: 10 * 60_000, getTracker: checkoutCustomerTracker }
  })
  checkout(@Query('restaurantId') restaurantId: string, @Body() body: ChannelCheckoutDto) {
    return this.channel.checkout(restaurantId, body);
  }

  @Get('channels/orders/:id')
  @Throttle({ whatsappSvc: { limit: 90, ttl: 60_000, getTracker: restaurantTracker } })
  getOrder(@Query('restaurantId') restaurantId: string, @Param('id') id: string) {
    return this.channel.getOrderStatus(restaurantId, id);
  }
}
