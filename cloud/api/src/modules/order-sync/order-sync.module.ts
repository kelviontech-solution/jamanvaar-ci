import { Module } from '@nestjs/common';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { OrderSyncController } from './order-sync.controller';
import { OrderSyncService } from './order-sync.service';

@Module({
  controllers: [OrderSyncController],
  providers: [OrderSyncService, DeviceAuthGuard]
})
export class OrderSyncModule {}
