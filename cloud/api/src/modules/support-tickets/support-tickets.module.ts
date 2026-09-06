import { Module } from '@nestjs/common';
import { SupportTicketsController } from './support-tickets.controller';
import { SupportTicketsService } from './support-tickets.service';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';

@Module({
  imports: [AuditModule, PlatformAuthModule],
  controllers: [SupportTicketsController],
  providers: [SupportTicketsService]
})
export class SupportTicketsModule {}
