import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { QrOrderingService, QrUsageReportInput } from './qr-ordering.service';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard';
import { CurrentTenantUser } from '../../common/decorators/current-tenant-user.decorator';

/**
 * A restaurant reading its own QR entitlement and reporting its own QR usage -
 * never another restaurant's. The restaurant id is always taken from the
 * authenticated principal; no route here accepts one from the body or query,
 * so a tenant cannot read or write across the tenant boundary.
 */
@Controller('api/v1/tenant/qr-ordering')
@UseGuards(TenantAuthGuard)
export class TenantQrOrderingController {
  constructor(private readonly qrService: QrOrderingService) {}

  @Get('entitlement')
  getEntitlement(@CurrentTenantUser() user: User) {
    return this.qrService.getEntitlementForRestaurant(user.restaurantId);
  }

  @Post('usage')
  reportUsage(@CurrentTenantUser() user: User, @Body() body: QrUsageReportInput) {
    return this.qrService.reportUsage(user, body);
  }
}
