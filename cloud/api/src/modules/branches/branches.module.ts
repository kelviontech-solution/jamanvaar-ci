import { Module } from '@nestjs/common';
import { BranchesController } from './branches.controller';
import { TenantBranchesController } from './tenant-branches.controller';
import { BranchesService } from './branches.service';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { TenantAuthModule } from '../tenant-auth/tenant-auth.module';

@Module({
  imports: [AuditModule, PlatformAuthModule, TenantAuthModule],
  controllers: [BranchesController, TenantBranchesController],
  providers: [BranchesService]
})
export class BranchesModule {}
