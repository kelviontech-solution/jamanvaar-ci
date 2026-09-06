import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { SupportService } from './support.service';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';

@Controller('api/v1/support')
@UseGuards(PlatformAuthGuard)
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get('search')
  search(@Query('q') query: string) {
    return this.support.search(query);
  }

  @Get('diagnostics/:restaurantId')
  diagnostics(@Param('restaurantId') restaurantId: string) {
    return this.support.getDiagnostics(restaurantId);
  }

  @Post('resend-invite')
  resendInvite(
    @Body() body: { userId: string; reason: string },
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.support.resendInvite(body.userId, body.reason, actor);
  }

  @Post('revoke-device-session')
  revokeDeviceSession(
    @Body() body: { deviceId: string; reason: string },
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.support.revokeDeviceSession(body.deviceId, body.reason, actor);
  }
}
