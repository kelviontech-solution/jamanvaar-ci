import { Module } from '@nestjs/common';
import { ActivationKeysController } from './activation-keys.controller';
import { ActivationRedeemController } from './activation-redeem.controller';
import { ActivationKeysService } from './activation-keys.service';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { ApplicationEntitlementsModule } from '../application-entitlements/application-entitlements.module';

@Module({
  imports: [AuditModule, PlatformAuthModule, ApplicationEntitlementsModule],
  controllers: [ActivationKeysController, ActivationRedeemController],
  providers: [ActivationKeysService]
})
export class ActivationKeysModule {}
