import { Body, Controller, Get, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import { User } from '@prisma/client';
import { WhatsAppChannelService } from './whatsapp-channel.service';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard';
import { CurrentTenantUser } from '../../common/decorators/current-tenant-user.decorator';
import { UpdateChannelSettingsDto, updateChannelSettingsSchema } from './dto/whatsapp-channel.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

/**
 * Restaurant Admin (pos-admin) → Settings → Integrations → WhatsApp Ordering. A restaurant
 * always acts on its own connection only — the restaurant id comes from the authenticated
 * device/tenant session, never from the body or a query param, same boundary every other
 * tenant controller in this codebase enforces.
 */
@Controller('api/v1/tenant/whatsapp-channel')
@UseGuards(TenantAuthGuard)
export class TenantWhatsAppChannelController {
  constructor(private readonly channel: WhatsAppChannelService) {}

  @Get('status')
  getStatus(@CurrentTenantUser() user: User) {
    return this.channel.getStatus(user.restaurantId);
  }

  /** Same shape/role as QR ordering's own entitlement endpoint — pos-admin polls this to
   *  decide whether to grey out the connector panel and what locked message to show. */
  @Get('entitlement')
  entitlement(@CurrentTenantUser() user: User) {
    return this.channel.entitlement(user.restaurantId);
  }

  @Post('generate-key')
  generateKey(@CurrentTenantUser() user: User) {
    return this.channel.generateKey(user.restaurantId, user.id);
  }

  @Post('revoke')
  revoke(@CurrentTenantUser() user: User) {
    return this.channel.revokeKey(user.restaurantId, user.id);
  }

  @Patch('settings')
  @UsePipes(new ZodValidationPipe(updateChannelSettingsSchema))
  updateSettings(@CurrentTenantUser() user: User, @Body() body: UpdateChannelSettingsDto) {
    return this.channel.updateSettings(user.restaurantId, user.id, body);
  }
}
