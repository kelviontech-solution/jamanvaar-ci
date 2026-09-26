import { Module } from '@nestjs/common';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { DbCounters } from '../../common/db-counters';
import { AuditModule } from '../audit/audit.module';
import { EntitySyncController } from './entity-sync.controller';
import { EntitySyncService } from './entity-sync.service';
import { StaffApprovalController } from './staff-approval.controller';
import { StaffApprovalService } from './staff-approval.service';

@Module({
  imports: [AuditModule],
  controllers: [EntitySyncController, StaffApprovalController],
  providers: [EntitySyncService, DeviceAuthGuard, StaffApprovalService, DbCounters],
  exports: [EntitySyncService]
})
export class EntitySyncModule {}
