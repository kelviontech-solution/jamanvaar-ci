import { Module } from '@nestjs/common';
import { AuditQueryController } from './audit-query.controller';
import { AuditQueryService } from './audit-query.service';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';

@Module({
  imports: [PlatformAuthModule],
  controllers: [AuditQueryController],
  providers: [AuditQueryService]
})
export class AuditQueryModule {}
