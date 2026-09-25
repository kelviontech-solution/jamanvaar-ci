import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { SyncObservabilityController } from './sync-observability.controller';
import { SyncObservabilityService } from './sync-observability.service';
import { SyncReconciliationService } from './sync-reconciliation.service';

@Module({
  imports: [AuditModule, PlatformAuthModule],
  controllers: [SyncObservabilityController],
  providers: [SyncObservabilityService, SyncReconciliationService],
  exports: [SyncObservabilityService, SyncReconciliationService]
})
export class SyncObservabilityModule {}
