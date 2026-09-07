import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { SandboxesController } from './sandboxes.controller';
import { SandboxesService } from './sandboxes.service';

@Module({
  imports: [AuditModule, PlatformAuthModule],
  controllers: [SandboxesController],
  providers: [SandboxesService],
  exports: [SandboxesService]
})
export class SandboxesModule {}
