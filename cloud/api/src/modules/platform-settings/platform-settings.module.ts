import { Global, Module } from '@nestjs/common';
import { BrandingService } from './branding.service';
import { PlatformSettingsController } from './platform-settings.controller';
import { PlatformSettingsService } from './platform-settings.service';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';

/** Global: invoices and emails read the branding without importing this module. */
@Global()
@Module({
  imports: [AuditModule, PlatformAuthModule],
  controllers: [PlatformSettingsController],
  providers: [PlatformSettingsService, BrandingService],
  exports: [PlatformSettingsService, BrandingService]
})
export class PlatformSettingsModule {}
