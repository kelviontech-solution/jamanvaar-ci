import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { MasterCatalogController } from './master-catalog.controller';
import { MasterCatalogService } from './master-catalog.service';

@Module({
  imports: [AuditModule, PlatformAuthModule],
  controllers: [MasterCatalogController],
  providers: [MasterCatalogService],
  exports: [MasterCatalogService]
})
export class MasterCatalogModule {}
