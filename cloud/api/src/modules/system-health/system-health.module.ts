import { Module } from '@nestjs/common';
import { PublicHealthController, SystemHealthController } from './system-health.controller';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';

@Module({
  imports: [PlatformAuthModule],
  controllers: [SystemHealthController, PublicHealthController]
})
export class SystemHealthModule {}
