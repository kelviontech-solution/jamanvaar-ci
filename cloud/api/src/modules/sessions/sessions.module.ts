import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PlatformAuthModule, AuditModule],
  controllers: [SessionsController]
})
export class SessionsModule {}
