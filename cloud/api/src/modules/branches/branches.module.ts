import { Module } from '@nestjs/common';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';

@Module({
  imports: [AuditModule, PlatformAuthModule],
  controllers: [BranchesController],
  providers: [BranchesService]
})
export class BranchesModule {}
