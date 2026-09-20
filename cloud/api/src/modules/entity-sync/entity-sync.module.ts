import { Module } from '@nestjs/common';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { EntitySyncController } from './entity-sync.controller';
import { EntitySyncService } from './entity-sync.service';

@Module({
  controllers: [EntitySyncController],
  providers: [EntitySyncService, DeviceAuthGuard],
  exports: [EntitySyncService]
})
export class EntitySyncModule {}
