import { Module } from '@nestjs/common';
import { SupportTicketsController } from './support-tickets.controller';
import { SupportTicketsService } from './support-tickets.service';
import { TenantSupportTicketsController } from './tenant-support-tickets.controller';
import { TenantSupportTicketsService } from './tenant-support-tickets.service';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { PlatformNotificationsModule } from '../platform-notifications/platform-notifications.module';

@Module({
  imports: [AuditModule, PlatformAuthModule, PlatformNotificationsModule],
  controllers: [SupportTicketsController, TenantSupportTicketsController],
  providers: [SupportTicketsService, TenantSupportTicketsService]
})
export class SupportTicketsModule {}
