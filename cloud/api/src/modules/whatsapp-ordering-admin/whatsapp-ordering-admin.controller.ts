import { Controller, Get, UseGuards } from '@nestjs/common';
import { WhatsAppOrderingAdminService } from './whatsapp-ordering-admin.service';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';

/** Super Admin's WhatsApp connector dashboard (Phase 6) -- entitlement toggling stays on the
 *  existing generic Applications tab (SubscriptionApplicationsController); this is read-only
 *  visibility into who's actually connected and using it. */
@Controller('api/v1/whatsapp-ordering')
@UseGuards(PlatformAuthGuard)
export class WhatsAppOrderingAdminController {
  constructor(private readonly service: WhatsAppOrderingAdminService) {}

  @Get('restaurants')
  listRestaurants() {
    return this.service.listRestaurants();
  }

  @Get('metrics')
  getMetrics() {
    return this.service.getMetrics();
  }
}
