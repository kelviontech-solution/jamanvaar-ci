import { BadRequestException, Body, Controller, ForbiddenException, Post, UseGuards } from '@nestjs/common';
import { Device } from '@prisma/client';
import { BackupsService } from './backups.service';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';

/**
 * Lets a device push an automatic backup of its own local data without a human present.
 *
 * security-audit MED-10: this used to accept a backup upload from ANY device type,
 * including a public Kiosk or a kitchen KDS screen, which have no reason to hold — let
 * alone back up — the restaurant's authoritative local database. Restricted to POS and
 * POS_ADMIN, the two terminal types that actually run it.
 */
const BACKUP_ELIGIBLE_DEVICE_TYPES = ['POS', 'POS_ADMIN'] as const;

@Controller('api/v1/devices/me/backups')
@UseGuards(DeviceAuthGuard)
export class DeviceBackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Post()
  create(@Body() body: { data?: unknown }, @CurrentDevice() device: Device) {
    if (!(BACKUP_ELIGIBLE_DEVICE_TYPES as readonly string[]).includes(device.type)) {
      throw new ForbiddenException(`${device.type} devices may not upload a backup`);
    }
    if (body.data === undefined) throw new BadRequestException('Missing "data" field');
    return this.backups.createFromDevice(device, body.data);
  }
}
