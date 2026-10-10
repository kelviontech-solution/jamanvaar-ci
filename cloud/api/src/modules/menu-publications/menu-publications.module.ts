import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { MenuPublicationsController } from './menu-publications.controller';
import { MenuPublicationsService } from './menu-publications.service';
import { ApplicationEntitlementsModule } from '../application-entitlements/application-entitlements.module';

@Module({
  imports: [AuditModule, ApplicationEntitlementsModule],
  controllers: [MenuPublicationsController],
  providers: [MenuPublicationsService, DeviceAuthGuard],
  exports: [MenuPublicationsService]
})
export class MenuPublicationsModule {}
