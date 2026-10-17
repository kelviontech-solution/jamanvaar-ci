import { ConfigurationRollbackService } from './configuration-rollback.service';
import { AdminWorkflowService } from './admin-workflow.service';
import { AdminWorkflowController, PlatformAdminWorkflowController } from './admin-workflow.controller';
import { ApplicationEntitlementsModule } from '../application-entitlements/application-entitlements.module';
import { ThaliRefillsService } from './thali-refills.service';
import { RecurringMenuService } from './recurring-menu.service';
import { PaymentsModule } from '../payments/payments.module';
import { DeviceCommandsModule } from '../device-commands/device-commands.module';
import { ServiceMaturityService } from './service-maturity.service';
import { ServiceMaturityController } from './service-maturity.controller';
import { Module } from '@nestjs/common';
import { TenantAuthModule } from '../tenant-auth/tenant-auth.module';
import { AuditModule } from '../audit/audit.module';
import { MenuPublicationsModule } from '../menu-publications/menu-publications.module';
import { StaffAuthModule } from '../entity-sync/staff-auth.module';
import { ActivationKeysModule } from '../activation-keys/activation-keys.module';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { DbCounters } from '../../common/db-counters';
import { OperationsService } from './operations.service';
import { OperationsScheduler } from './operations-scheduler.service';
import { OperationsWorkflows } from './operations-workflows.service';
import {
  OperationsController,
  DeviceOperationsController,
  PickupDisplayController,
} from './operations.controller';
@Module({
  imports: [ApplicationEntitlementsModule, PaymentsModule, DeviceCommandsModule, TenantAuthModule, AuditModule, MenuPublicationsModule, StaffAuthModule, ActivationKeysModule],
  controllers: [AdminWorkflowController, PlatformAdminWorkflowController, ServiceMaturityController, OperationsController, DeviceOperationsController, PickupDisplayController],
  providers: [AdminWorkflowService, ConfigurationRollbackService, ThaliRefillsService, RecurringMenuService, ServiceMaturityService, OperationsService, OperationsScheduler, OperationsWorkflows, DeviceAuthGuard, DbCounters],
})
export class OperationsModule {}
