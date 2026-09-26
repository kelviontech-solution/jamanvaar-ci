import { Module } from '@nestjs/common';
import { QrOrderingController } from './qr-ordering.controller';
import { TenantQrOrderingController } from './qr-ordering.tenant.controller';
import { QrOrderingService } from './qr-ordering.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { TenantAuthModule } from '../tenant-auth/tenant-auth.module';
import { ApplicationEntitlementsModule } from '../application-entitlements/application-entitlements.module';

@Module({
  imports: [PrismaModule, AuditModule, PlatformAuthModule, TenantAuthModule, ApplicationEntitlementsModule],
  controllers: [QrOrderingController, TenantQrOrderingController],
  providers: [QrOrderingService],
  exports: [QrOrderingService]
})
export class QrOrderingModule {}
