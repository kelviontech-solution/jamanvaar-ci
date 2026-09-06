import { Module } from '@nestjs/common';
import { TenantBackupsController } from './tenant-backups.controller';
import { DeviceBackupsController } from './device-backups.controller';
import { PlatformBackupsController, PlatformBackupsFleetController } from './platform-backups.controller';
import { BackupsService } from './backups.service';
import { BackupStorageService } from './backup-storage.service';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { TenantAuthModule } from '../tenant-auth/tenant-auth.module';
import { DevicesModule } from '../devices/devices.module';

@Module({
  imports: [AuditModule, PlatformAuthModule, TenantAuthModule, DevicesModule],
  controllers: [TenantBackupsController, DeviceBackupsController, PlatformBackupsController, PlatformBackupsFleetController],
  providers: [BackupsService, BackupStorageService],
  exports: [BackupsService]
})
export class BackupsModule {}
