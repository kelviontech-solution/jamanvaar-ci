import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { TenantBillingController } from './tenant-billing.controller';
import { InvoicesService } from './invoices.service';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { TenantAuthModule } from '../tenant-auth/tenant-auth.module';

@Module({
  imports: [AuditModule, PlatformAuthModule, TenantAuthModule],
  controllers: [InvoicesController, TenantBillingController],
  providers: [InvoicesService],
  exports: [InvoicesService]
})
export class BillingModule {}

