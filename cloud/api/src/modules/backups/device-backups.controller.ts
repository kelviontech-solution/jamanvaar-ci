import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Device } from '@prisma/client';
import { BackupsService } from './backups.service';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';

/** Lets a device push an automatic backup of its own local data without a human present. */
@Controller('api/v1/devices/me/backups')
@UseGuards(DeviceAuthGuard)
export class DeviceBackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Post()
  create(@Body() body: { data?: unknown }, @CurrentDevice() device: Device) {
    if (body.data === undefined) throw new BadRequestException('Missing "data" field');
    return this.backups.createFromDevice(device, body.data);
  }
}
