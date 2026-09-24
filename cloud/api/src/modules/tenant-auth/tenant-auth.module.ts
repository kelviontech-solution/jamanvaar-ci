import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TenantAuthController, TenantMeController } from './tenant-auth.controller';
import { TenantAuthService } from './tenant-auth.service';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard';
import { AuditModule } from '../audit/audit.module';
import { ApplicationEntitlementsModule } from '../application-entitlements/application-entitlements.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';

@Module({
  imports: [JwtModule.register({}), AuditModule, ApplicationEntitlementsModule, RestaurantsModule],
  controllers: [TenantAuthController, TenantMeController],
  providers: [TenantAuthService, TenantAuthGuard],
  exports: [TenantAuthGuard, TenantAuthService, JwtModule]
})
export class TenantAuthModule {}
