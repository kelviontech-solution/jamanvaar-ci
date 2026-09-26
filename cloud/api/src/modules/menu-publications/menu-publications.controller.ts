import { Body, Controller, Get, Post, UseGuards, UsePipes } from '@nestjs/common';
import { Device } from '@prisma/client';
import { DeviceSyncThrottle } from '../../common/throttle';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';
import { MenuPublicationsService, PublishMenuDto, publishMenuSchema } from './menu-publications.service';

@DeviceSyncThrottle()
@Controller('api/v1/menu')
@UseGuards(DeviceAuthGuard)
export class MenuPublicationsController {
  constructor(private readonly menu: MenuPublicationsService) {}

  @Get('version')
  version(@CurrentDevice() device: Device) {
    return this.menu.latest(device.restaurantId);
  }

  @Get('draft-status')
  draftStatus(@CurrentDevice() device: Device) {
    return this.menu.draftStatus(device);
  }

  @Post('publish')
  @UsePipes(new ZodValidationPipe(publishMenuSchema))
  publish(@Body() body: PublishMenuDto, @CurrentDevice() device: Device) {
    return this.menu.publish(device, body);
  }
}
