import { Body, Controller, Patch, UseGuards, UsePipes } from '@nestjs/common';
import { Device } from '@prisma/client';
import { DevicesService } from './devices.service';
import { heartbeatSchema } from './dto/heartbeat.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';

/**
 * Deliberately a separate controller from DevicesController (PlatformAuthGuard
 * at the class level) — a device authenticates as itself here, never as a
 * Super Admin, and can only ever update its OWN row (there is no :id param;
 * the device is identified entirely by the credential DeviceAuthGuard verified).
 */
@Controller('api/v1/devices/me')
@UseGuards(DeviceAuthGuard)
export class DeviceHeartbeatController {
  constructor(private readonly devices: DevicesService) {}

  @Patch('heartbeat')
  @UsePipes(new ZodValidationPipe(heartbeatSchema))
  heartbeat(@Body() body: ReturnType<typeof heartbeatSchema.parse>, @CurrentDevice() device: Device) {
    return this.devices.reportHeartbeat(device, body);
  }
}
