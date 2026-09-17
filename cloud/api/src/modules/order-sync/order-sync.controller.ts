import { Body, Controller, Get, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { Device } from '@prisma/client';
import { OrderSyncService } from './order-sync.service';
import { pushOrderSyncSchema, PushOrderSyncDto } from './dto/push-order-sync.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';

// Any activated device on the tenant (POS, KDS, Captain, ...) can push or
// pull here — unlike payments' Kiosk-only gate, order sync is deliberately
// open to every terminal type since all of them both create and consume
// order state (POS creates, KDS reads, Captain reads+updates).
@Controller('api/v1/orders/sync')
@UseGuards(DeviceAuthGuard)
export class OrderSyncController {
  constructor(private readonly orderSync: OrderSyncService) {}

  @Post()
  @UsePipes(new ZodValidationPipe(pushOrderSyncSchema))
  push(@Body() body: PushOrderSyncDto, @CurrentDevice() device: Device) {
    return this.orderSync.pushEvents(device, body.events);
  }

  @Get()
  pull(@Query('since') since: string | undefined, @CurrentDevice() device: Device) {
    return this.orderSync.catchUp(device, since);
  }
}
