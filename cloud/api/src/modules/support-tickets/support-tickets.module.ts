import { Module } from '@nestjs/common';
import { ApplicationEntitlementsModule } from '../application-entitlements/application-entitlements.module';
import { QrFeatureRequestsService } from './qr-feature-requests.service';
import { ActivationKeysModule } from '../activation-keys/activation-keys.module';
import { SupportTicketsController } from './support-tickets.controller';
import { SupportTicketsService } from './support-tickets.service';
import { TenantSupportTicketsController } from './tenant-support-tickets.controller';
import { TenantSupportTicketsService } from './tenant-support-tickets.service';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { PlatformNotificationsModule } from '../platform-notifications/platform-notifications.module';

@Module({
  imports: [ActivationKeysModule, ApplicationEntitlementsModule, AuditModule, PlatformAuthModule, PlatformNotificationsModule],
  controllers: [SupportTicketsController, TenantSupportTicketsController],
  providers: [SupportTicketsService, TenantSupportTicketsService, QrFeatureRequestsService]
})
export class SupportTicketsModule {}
