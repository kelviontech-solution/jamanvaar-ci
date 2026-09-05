import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';

@Module({
  imports: [PlatformAuthModule],
  controllers: [SessionsController]
})
export class SessionsModule {}
