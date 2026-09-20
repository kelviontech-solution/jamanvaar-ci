import { Module } from '@nestjs/common';
import { ActivationKeysModule } from '../activation-keys/activation-keys.module';
import { BackupsModule } from '../backups/backups.module';
import { BillingModule } from '../billing/billing.module';
import { OfflinePolicyModule } from '../offline-policy/offline-policy.module';
import { PlatformNotificationsModule } from '../platform-notifications/platform-notifications.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [PlatformAuthModule, BillingModule, ActivationKeysModule, OfflinePolicyModule, BackupsModule, PlatformNotificationsModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService]
})
export class JobsModule {}
