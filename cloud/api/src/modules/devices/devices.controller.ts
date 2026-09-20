import { Body, Controller, Get, Param, Patch, Query, UseGuards, UsePipes } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { DevicesService } from './devices.service';
import { renameDeviceSchema } from './dto/heartbeat.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';

@Controller('api/v1/devices')
@UseGuards(PlatformAuthGuard)
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  list(@Query() query: Record<string, string>) {
    return this.devices.list(query);
  }

  @Get('by-restaurant')
  byRestaurant(@Query() query: Record<string, string>) {
    return this.devices.byRestaurant(query);
  }

  @Patch(':id')
  @UsePipes(new ZodValidationPipe(renameDeviceSchema))
  rename(@Param('id') id: string, @Body() body: ReturnType<typeof renameDeviceSchema.parse>, @CurrentPlatformUser() actor: PlatformUser) {
    return this.devices.rename(id, body.name, actor);
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
