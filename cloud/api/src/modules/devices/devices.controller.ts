import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { DevicesService } from './devices.service';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';

@Controller('api/v1/devices')
@UseGuards(PlatformAuthGuard)
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  list(@Query('restaurantId') restaurantId?: string) {
    return this.devices.list(restaurantId);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.devices.getById(id);
  }

  @Patch(':id/revoke')
  revoke(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.devices.revoke(id, actor);
  }
}
