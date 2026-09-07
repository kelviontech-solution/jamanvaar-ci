import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { OfflinePolicyController } from './offline-policy.controller';
import { OfflinePolicyService } from './offline-policy.service';

@Module({
  imports: [ConfigModule, AuditModule, PlatformAuthModule],
  controllers: [OfflinePolicyController],
  providers: [OfflinePolicyService],
  exports: [OfflinePolicyService]
})
export class OfflinePolicyModule {}
