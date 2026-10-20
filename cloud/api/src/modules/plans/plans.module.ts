import { Module } from '@nestjs/common';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { ApplicationEntitlementsModule } from '../application-entitlements/application-entitlements.module';

@Module({
  imports: [AuditModule, PlatformAuthModule, ApplicationEntitlementsModule],
  controllers: [PlansController],
  providers: [PlansService],
  exports: [PlansService]
})
export class PlansModule {}
