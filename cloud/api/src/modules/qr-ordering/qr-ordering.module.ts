import { Module } from '@nestjs/common';
import { QrOrderingController } from './qr-ordering.controller';
import { TenantQrOrderingController } from './qr-ordering.tenant.controller';
import { QrOrderingService } from './qr-ordering.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { TenantAuthModule } from '../tenant-auth/tenant-auth.module';

@Module({
  imports: [PrismaModule, AuditModule, PlatformAuthModule, TenantAuthModule],
  controllers: [QrOrderingController, TenantQrOrderingController],
  providers: [QrOrderingService],
  exports: [QrOrderingService]
})
export class QrOrderingModule {}
