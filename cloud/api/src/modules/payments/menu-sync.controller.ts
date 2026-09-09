import { Body, Controller, ForbiddenException, Post, UseGuards, UsePipes } from '@nestjs/common';
import { Device } from '@prisma/client';
import { MenuSyncService } from './menu-sync.service';
import { menuSyncSchema, MenuSyncDto } from './dto/menu-sync.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';

@Controller('api/v1/tenant/menu-sync')
@UseGuards(DeviceAuthGuard)
export class MenuSyncController {
  constructor(private readonly menuSync: MenuSyncService) {}

  @Post()
  @UsePipes(new ZodValidationPipe(menuSyncSchema))
  async sync(@Body() body: MenuSyncDto, @CurrentDevice() device: Device) {
    if (device.type !== 'KIOSK_ADMIN') {
      throw new ForbiddenException('Only a Kiosk Admin device can push a menu snapshot');
    }
    return this.menuSync.upsertItems(device.restaurantId, body.items);
  }
}
