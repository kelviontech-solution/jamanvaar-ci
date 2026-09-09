import { Module } from '@nestjs/common';
import { SubscriptionApplicationsController, RestaurantApplicationsController } from './application-entitlements.controller';
import { ApplicationEntitlementsService } from './application-entitlements.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';

@Module({
  imports: [PrismaModule, AuditModule, PlatformAuthModule],
  controllers: [SubscriptionApplicationsController, RestaurantApplicationsController],
  providers: [ApplicationEntitlementsService],
  exports: [ApplicationEntitlementsService]
})
export class ApplicationEntitlementsModule {}
