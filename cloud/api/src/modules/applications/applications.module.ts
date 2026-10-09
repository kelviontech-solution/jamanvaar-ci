import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { TenantApplicationsController } from './tenant-applications.controller';
import { UpdaterManifestController } from './updater-manifest.controller';
import { ApplicationsService } from './applications.service';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { TenantAuthModule } from '../tenant-auth/tenant-auth.module';
import { ApplicationEntitlementsModule } from '../application-entitlements/application-entitlements.module';

@Module({
  imports: [AuditModule, PlatformAuthModule, TenantAuthModule, ApplicationEntitlementsModule],
  controllers: [ApplicationsController, TenantApplicationsController, UpdaterManifestController],
  providers: [ApplicationsService],
  exports: [ApplicationsService]
})
export class ApplicationsModule {}
