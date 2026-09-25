import { Module } from '@nestjs/common';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { OrderSyncController } from './order-sync.controller';
import { OrderSyncService } from './order-sync.service';
import { NumberLeasesController } from './number-leases.controller';
import { NumberLeasesService } from './number-leases.service';

@Module({
  controllers: [OrderSyncController, NumberLeasesController],
  providers: [OrderSyncService, NumberLeasesService, DeviceAuthGuard]
})
export class OrderSyncModule {}
