import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { TenantAuthModule } from '../tenant-auth/tenant-auth.module';
import { TenantDashboardController } from './tenant-dashboard.controller';
import { TenantDashboardService } from './tenant-dashboard.service';

@Module({
  imports: [PlatformAuthModule,TenantAuthModule],
  controllers: [DashboardController,TenantDashboardController],
  providers: [DashboardService,TenantDashboardService],
  exports: [TenantDashboardService]
})
export class DashboardModule {}
