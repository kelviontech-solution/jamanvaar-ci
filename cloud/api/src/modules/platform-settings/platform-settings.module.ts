import { Global, Module } from '@nestjs/common';
import { BrandingService } from './branding.service';
import { PlatformSettingsController } from './platform-settings.controller';
import { PlatformSettingsService } from './platform-settings.service';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { WelcomeDesignsService } from './welcome-designs.service';
import { PlatformWelcomeDesignsController, DeviceWelcomeDesignsController, PublicWelcomeDesignsController } from './welcome-designs.controller';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';

/** Global: invoices and emails read the branding without importing this module. */
@Global()
@Module({
  imports: [AuditModule, PlatformAuthModule],
  controllers: [PlatformSettingsController, PlatformWelcomeDesignsController, DeviceWelcomeDesignsController, PublicWelcomeDesignsController],
  providers: [PlatformSettingsService, BrandingService, WelcomeDesignsService, DeviceAuthGuard],
  exports: [PlatformSettingsService, BrandingService, WelcomeDesignsService]
})
export class PlatformSettingsModule {}
