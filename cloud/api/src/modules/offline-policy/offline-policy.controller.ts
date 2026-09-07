import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { GrantOfflineExtensionDto, OfflinePolicyService } from './offline-policy.service';

@Controller('api/v1/platform/offline-policy')
@UseGuards(PlatformAuthGuard)
export class OfflinePolicyController {
  constructor(private readonly offlinePolicyService: OfflinePolicyService) {}

  @Get('extensions')
  listExtensions(@Query('restaurantId') restaurantId?: string) {
    return this.offlinePolicyService.listExtensions(restaurantId);
  }

  @Get('approaching-expiry')
  getDevicesApproachingExpiry() {
    return this.offlinePolicyService.getDevicesApproachingExpiry();
  }

  @Post('grant')
  grantExtension(
    @Body() dto: GrantOfflineExtensionDto,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.offlinePolicyService.grantExtension(dto, actor);
  }

  @Patch('extensions/:id/revoke')
  revokeExtension(
    @Param('id') id: string,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.offlinePolicyService.revokeExtension(id, actor);
  }
}
