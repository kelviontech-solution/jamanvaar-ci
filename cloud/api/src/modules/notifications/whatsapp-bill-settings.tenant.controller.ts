import { Body, Controller, Delete, Get, Post, Put, UseGuards, UsePipes } from '@nestjs/common';
import { User } from '@prisma/client';
import { z } from 'zod';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard';
import { CurrentTenantUser } from '../../common/decorators/current-tenant-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { WhatsAppBillSettingsService } from './whatsapp-bill-settings.service';

const saveSchema = z.object({
  // Digits only (optionally +91 / 91 prefix, spaces or dashes); anything with letters is refused.
  number: z.string().trim().regex(/^(\+?91[\s-]?)?[6-9][\d\s-]{9,12}$/, 'Enter a valid 10-digit Indian mobile number')
});

/**
 * Kiosk Admin / Restaurant Admin → Receipts → "WhatsApp number for bills". A restaurant only ever
 * acts on its own setting: the restaurant id comes from the authenticated session, never the body.
 */
@Controller('api/v1/tenant/whatsapp-bill')
@UseGuards(TenantAuthGuard)
export class WhatsAppBillSettingsTenantController {
  constructor(private readonly settings: WhatsAppBillSettingsService) {}

  @Get()
  get(@CurrentTenantUser() user: User) {
    return this.settings.get(user.restaurantId);
  }

  @Put()
  @UsePipes(new ZodValidationPipe(saveSchema))
  save(@CurrentTenantUser() user: User, @Body() body: z.infer<typeof saveSchema>) {
    return this.settings.save(user.restaurantId, user.role, body.number);
  }

  @Post('recheck')
  recheck(@CurrentTenantUser() user: User) {
    return this.settings.recheck(user.restaurantId, user.role);
  }

  @Post('template')
  template(@CurrentTenantUser() user: User) {
    return this.settings.ensureTemplate(user.restaurantId, user.role);
  }

  @Delete()
  clear(@CurrentTenantUser() user: User) {
    return this.settings.clear(user.restaurantId, user.role);
  }
}
