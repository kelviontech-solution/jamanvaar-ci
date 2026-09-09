import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { BillingModule } from '../billing/billing.module';
import { ApplicationEntitlementsModule } from '../application-entitlements/application-entitlements.module';

@Module({
  imports: [AuditModule, PlatformAuthModule, BillingModule, ApplicationEntitlementsModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService]
})
export class SubscriptionsModule {}
