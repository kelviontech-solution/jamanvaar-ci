import { Module } from '@nestjs/common';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { AuditModule } from '../audit/audit.module';
import { StaffAuthModule } from '../entity-sync/staff-auth.module';
import { WhatsAppOutboundWebhookModule } from '../whatsapp-outbound/whatsapp-outbound-webhook.module';
import { OrderSyncController } from './order-sync.controller';
import { OrderSyncService } from './order-sync.service';
import { NumberLeasesController } from './number-leases.controller';
import { NumberLeasesService } from './number-leases.service';

@Module({
  imports: [AuditModule, StaffAuthModule, WhatsAppOutboundWebhookModule],
  controllers: [OrderSyncController, NumberLeasesController],
  providers: [OrderSyncService, NumberLeasesService, DeviceAuthGuard],
  exports: [OrderSyncService]
})
export class OrderSyncModule {}
