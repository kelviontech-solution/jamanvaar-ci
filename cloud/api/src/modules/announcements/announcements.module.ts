import { Module } from '@nestjs/common';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PlatformAuthModule, AuditModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
  exports: [AnnouncementsService]
})
export class AnnouncementsModule {}
