import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { PlatformUsersService } from './platform-users.service';
import { inviteTeammateSchema, updateRoleSchema, activateTeammateSchema } from './dto/platform-user.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';

@Controller('api/v1/platform-users')
export class PlatformUsersController {
  constructor(private readonly platformUsers: PlatformUsersService) {}

  /** Public — a newly invited teammate has no session yet, matching /api/v1/tenant-auth/set-initial-password. */
  @Post('activate')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(activateTeammateSchema))
  async activate(@Body() body: ReturnType<typeof activateTeammateSchema.parse>) {
    await this.platformUsers.activate(body);
    return { success: true };
  }

  @Get()
  @UseGuards(PlatformAuthGuard)
  list() {
    return this.platformUsers.list();
  }

  @Post('invite')
  @UseGuards(PlatformAuthGuard)
  @UsePipes(new ZodValidationPipe(inviteTeammateSchema))
  invite(
    @Body() body: ReturnType<typeof inviteTeammateSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.platformUsers.invite(body, actor);
  }

  @Post(':id/resend-invite')
  @UseGuards(PlatformAuthGuard)
  resendInvite(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.platformUsers.resendInvite(id, actor);
  }

  @Patch(':id/role')
  @UseGuards(PlatformAuthGuard)
  @UsePipes(new ZodValidationPipe(updateRoleSchema))
  updateRole(
    @Param('id') id: string,
    @Body() body: ReturnType<typeof updateRoleSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.platformUsers.updateRole(id, body, actor);
  }

  @Patch(':id/enable')
  @UseGuards(PlatformAuthGuard)
  enable(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.platformUsers.setStatus(id, 'ACTIVE', actor);
  }

  @Patch(':id/disable')
  @UseGuards(PlatformAuthGuard)
  disable(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.platformUsers.setStatus(id, 'DISABLED', actor);
  }
}
