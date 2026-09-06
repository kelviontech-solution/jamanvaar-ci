import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { DeviceHeartbeatController } from './device-heartbeat.controller';
import { DevicesService } from './devices.service';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';

@Module({
  imports: [AuditModule, PlatformAuthModule],
  controllers: [DevicesController, DeviceHeartbeatController],
  providers: [DevicesService, DeviceAuthGuard],
  exports: [DeviceAuthGuard]
})
export class DevicesModule {}
