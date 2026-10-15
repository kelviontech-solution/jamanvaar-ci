import { Module } from '@nestjs/common';
import { SubscriptionApplicationsController, RestaurantApplicationsController, ApplicationCatalogController } from './application-entitlements.controller';
import { ApplicationEntitlementsService } from './application-entitlements.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import {BranchLicensesController} from './branch-licenses.controller';
import {BranchLicensesService} from './branch-licenses.service';

@Module({
  imports: [PrismaModule, AuditModule, PlatformAuthModule],
  controllers: [SubscriptionApplicationsController, RestaurantApplicationsController, ApplicationCatalogController,BranchLicensesController],
  providers: [ApplicationEntitlementsService,BranchLicensesService],
  exports: [ApplicationEntitlementsService]
})
export class ApplicationEntitlementsModule {}
