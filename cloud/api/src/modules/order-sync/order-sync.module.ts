import { Module } from '@nestjs/common';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { AuditModule } from '../audit/audit.module';
import { StaffAuthModule } from '../entity-sync/staff-auth.module';
import { WhatsAppOutboundWebhookModule } from '../whatsapp-outbound/whatsapp-outbound-webhook.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { OrderSyncController, OrderSyncRuntimeController } from './order-sync.controller';
import { OrderSyncService } from './order-sync.service';
import { OrderSyncAdmission } from './order-sync-admission';
import { NumberLeasesController } from './number-leases.controller';
import { NumberLeasesService } from './number-leases.service';

@Module({
  imports: [AuditModule, StaffAuthModule, WhatsAppOutboundWebhookModule, PlatformAuthModule],
  controllers: [OrderSyncController, OrderSyncRuntimeController, NumberLeasesController],
  providers: [OrderSyncService, OrderSyncAdmission, NumberLeasesService, DeviceAuthGuard],
  exports: [OrderSyncService, OrderSyncAdmission]
})
export class OrderSyncModule {}
