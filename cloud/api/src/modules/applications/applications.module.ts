import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { TenantApplicationsController } from './tenant-applications.controller';
import { ApplicationsService } from './applications.service';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { TenantAuthModule } from '../tenant-auth/tenant-auth.module';

@Module({
  imports: [AuditModule, PlatformAuthModule, TenantAuthModule],
  controllers: [ApplicationsController, TenantApplicationsController],
  providers: [ApplicationsService],
  exports: [ApplicationsService]
})
export class ApplicationsModule {}
