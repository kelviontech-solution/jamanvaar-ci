import { Body, Controller, Post, UseGuards, UsePipes } from '@nestjs/common';
import { Device } from '@prisma/client';
import { DeviceSyncThrottle } from '../../common/throttle';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';
import { NumberLeaseDto, NumberLeasesService, numberLeaseSchema } from './number-leases.service';

@DeviceSyncThrottle()
@Controller('api/v1/sync/number-leases')
@UseGuards(DeviceAuthGuard)
export class NumberLeasesController {
  constructor(private readonly leases: NumberLeasesService) {}

  @Post()
  @UsePipes(new ZodValidationPipe(numberLeaseSchema))
  lease(@Body() body: NumberLeaseDto, @CurrentDevice() device: Device) {
    return this.leases.lease(device, body);
  }
}
