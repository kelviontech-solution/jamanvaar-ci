import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { DeviceCommandsController } from './device-commands.controller';
import { DeviceCommandsService } from './device-commands.service';

@Module({
  imports: [AuditModule, PlatformAuthModule],
  controllers: [DeviceCommandsController],
  providers: [DeviceCommandsService, DeviceAuthGuard],
  exports: [DeviceCommandsService]
})
export class DeviceCommandsModule {}
