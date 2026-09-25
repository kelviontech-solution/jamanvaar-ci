import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { MenuPublicationsController } from './menu-publications.controller';
import { MenuPublicationsService } from './menu-publications.service';

@Module({
  imports: [AuditModule],
  controllers: [MenuPublicationsController],
  providers: [MenuPublicationsService, DeviceAuthGuard]
})
export class MenuPublicationsModule {}
