import { Module } from '@nestjs/common';
import { OwnersController } from './owners.controller';
import { OwnersService } from './owners.service';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';

@Module({
  imports: [AuditModule, PlatformAuthModule],
  controllers: [OwnersController],
  providers: [OwnersService]
})
export class OwnersModule {}
