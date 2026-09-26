import { Module } from '@nestjs/common';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { AuditModule } from '../audit/audit.module';
import { EntitySyncController } from './entity-sync.controller';
import { EntitySyncService } from './entity-sync.service';
import { StaffAuthModule } from './staff-auth.module';

@Module({
  imports: [AuditModule, StaffAuthModule],
  controllers: [EntitySyncController],
  providers: [EntitySyncService, DeviceAuthGuard],
  exports: [EntitySyncService]
})
export class EntitySyncModule {}
