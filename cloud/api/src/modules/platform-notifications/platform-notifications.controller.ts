import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { PlatformNotificationsService } from './platform-notifications.service';

@Controller('api/v1/platform/notifications')
@UseGuards(PlatformAuthGuard)
export class PlatformNotificationsController {
  constructor(private readonly notifications: PlatformNotificationsService) {}

  @Get()
  list(
    @CurrentPlatformUser() actor: PlatformUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('unread') unread?: string,
    @Query('severity') severity?: string,
    @Query('type') type?: string,
    @Query('restaurantId') restaurantId?: string
  ) {
    return this.notifications.list(actor.id, { page, pageSize, unread, severity, type, restaurantId });
  }

  @Get('unread-count')
  unreadCount(@CurrentPlatformUser() actor: PlatformUser) {
    return this.notifications.unreadCount(actor.id);
  }

  @Post('read-all')
  readAll(@CurrentPlatformUser() actor: PlatformUser, @Body() body?: { restaurantId?: string }) {
    return this.notifications.markAllRead(actor.id, body?.restaurantId);
  }

  @Post(':id/read')
  read(@CurrentPlatformUser() actor: PlatformUser, @Param('id') id: string) {
    return this.notifications.markRead(actor.id, id);
  }
}
