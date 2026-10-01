import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Res, UseGuards, UsePipes } from '@nestjs/common';
import type { Response } from 'express';
import { WhatsAppChannelService } from './whatsapp-channel.service';
import { ServiceSignatureGuard } from '../../common/guards/service-signature.guard';
import { ChannelCheckoutDto, ChannelQuoteDto, channelCheckoutSchema, channelQuoteSchema } from './dto/whatsapp-channel.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

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
  validateKey(@Body('key') key: string) {
    return this.channel.validateKey(key);
  }

  @Get('channels/menu')
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
  quote(@Query('restaurantId') restaurantId: string, @Body() body: ChannelQuoteDto) {
    return this.channel.quote(restaurantId, body);
  }

  @Post('channels/checkout')
  @UsePipes(new ZodValidationPipe(channelCheckoutSchema))
  checkout(@Query('restaurantId') restaurantId: string, @Body() body: ChannelCheckoutDto) {
    return this.channel.checkout(restaurantId, body);
  }

  @Get('channels/orders/:id')
  getOrder(@Query('restaurantId') restaurantId: string, @Param('id') id: string) {
    return this.channel.getOrderStatus(restaurantId, id);
  }
}
