import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { QrEntitlementOverride, QrOrderingService } from './qr-ordering.service';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';

@Controller('api/v1/qr-ordering')
@UseGuards(PlatformAuthGuard)
export class QrOrderingController {
  constructor(private readonly qrService: QrOrderingService) {}

  @Get('restaurants')
  listRestaurants() {
    return this.qrService.getQrRestaurants();
  }

  @Get('metrics')
  getMetrics() {
    return this.qrService.getPlatformQrMetrics();
  }

  @Get('restaurants/:id')
  getRestaurantDetail(@Param('id') id: string) {
    return this.qrService.getRestaurantQrDetail(id);
  }

  @Get('restaurants/:id/usage')
  getRestaurantUsage(@Param('id') id: string) {
    return this.qrService.getRestaurantUsage(id);
  }

  @Get('restaurants/:id/audit')
  getRestaurantAudit(@Param('id') id: string) {
    return this.qrService.getRestaurantQrAudit(id);
  }

  @Patch('restaurants/:id/entitlement')
  updateEntitlement(
    @Param('id') id: string,
    @Body() body: QrEntitlementOverride,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.qrService.updateRestaurantEntitlement(id, body, actor);
  }
}
