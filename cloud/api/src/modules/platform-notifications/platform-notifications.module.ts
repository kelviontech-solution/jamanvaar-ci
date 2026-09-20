import { Module } from '@nestjs/common';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { PlatformNotificationsController } from './platform-notifications.controller';
import { PlatformNotificationsService } from './platform-notifications.service';

@Module({
  imports: [PlatformAuthModule],
  controllers: [PlatformNotificationsController],
  providers: [PlatformNotificationsService],
  exports: [PlatformNotificationsService]
})
export class PlatformNotificationsModule {}
