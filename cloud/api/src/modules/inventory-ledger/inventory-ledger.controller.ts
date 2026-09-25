import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { Device } from '@prisma/client';
import { DeviceSyncThrottle } from '../../common/throttle';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';
import { InventoryLedgerService, pushMovementsSchema } from './inventory-ledger.service';

// Stock is owned by the devices that hold recipes/inventory (Restaurant Admin). Every activated device
// authenticates, but only ever sees its own branch's ledger.
@DeviceSyncThrottle()
@Controller('api/v1/inventory')
@UseGuards(DeviceAuthGuard)
export class InventoryLedgerController {
  constructor(private readonly ledger: InventoryLedgerService) {}

  @Post('movements')
  @UsePipes(new ZodValidationPipe(pushMovementsSchema))
  push(@Body() body: { movements: unknown[] }, @CurrentDevice() device: Device) {
    return this.ledger.push(device, body.movements);
  }

  @Get('movements')
  pull(@Query('afterSeq') afterSeq: string | undefined, @CurrentDevice() device: Device) {
    const cursor = afterSeq === undefined ? 0 : Number(afterSeq);
    if (!Number.isInteger(cursor) || cursor < 0) throw new BadRequestException('afterSeq must be a non-negative integer');
    return this.ledger.pull(device, cursor);
  }

  @Get('balances')
  balances(@CurrentDevice() device: Device) {
    return this.ledger.balances(device);
  }
}
