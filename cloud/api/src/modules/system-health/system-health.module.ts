import { Module } from '@nestjs/common';
import { SystemHealthController } from './system-health.controller';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';

@Module({
  imports: [PlatformAuthModule],
  controllers: [SystemHealthController]
})
export class SystemHealthModule {}
