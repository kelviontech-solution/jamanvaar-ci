import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { GrantOfflineExtensionDto, grantOfflineExtensionSchema } from './dto/grant-offline-extension.dto';
import { OfflinePolicyService } from './offline-policy.service';

@Controller('api/v1/platform/offline-policy')
@UseGuards(PlatformAuthGuard)
export class OfflinePolicyController {
  constructor(private readonly offlinePolicyService: OfflinePolicyService) {}

  @Get('signing-status')
  signingStatus() {
    return this.offlinePolicyService.signingStatus();
  }

  @Get('extensions')
  listExtensions(@Query('restaurantId') restaurantId?: string) {
    return this.offlinePolicyService.listExtensions(restaurantId);
  }

  @Get('approaching-expiry')
  getDevicesApproachingExpiry(@Query('state') state?: string) {
    return this.offlinePolicyService.getDevicesApproachingExpiry(state === 'locked' ? 'locked' : 'approaching');
  }

  @Get('policy')
  policy() {
    return this.offlinePolicyService.policy();
  }

  @Post('grant')
  @UsePipes(new ZodValidationPipe(grantOfflineExtensionSchema))
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
