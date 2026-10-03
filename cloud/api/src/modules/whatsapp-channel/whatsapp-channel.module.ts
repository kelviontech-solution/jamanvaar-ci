import { Module } from '@nestjs/common';
import { WhatsAppChannelService } from './whatsapp-channel.service';
import { TenantWhatsAppChannelController } from './whatsapp-channel.tenant.controller';
import { ServiceWhatsAppChannelController } from './whatsapp-channel.service.controller';
import { AuditModule } from '../audit/audit.module';
import { TenantAuthModule } from '../tenant-auth/tenant-auth.module';
import { QrModule } from '../qr/qr.module';
import { PaymentsModule } from '../payments/payments.module';
import { ApplicationEntitlementsModule } from '../application-entitlements/application-entitlements.module';
import { PlatformNotificationsModule } from '../platform-notifications/platform-notifications.module';

@Module({
  imports: [AuditModule, TenantAuthModule, QrModule, PaymentsModule, ApplicationEntitlementsModule, PlatformNotificationsModule],
  controllers: [TenantWhatsAppChannelController, ServiceWhatsAppChannelController],
  providers: [WhatsAppChannelService],
  exports: [WhatsAppChannelService]
})
export class WhatsAppChannelModule {}
