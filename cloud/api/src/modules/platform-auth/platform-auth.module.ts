import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PlatformAuthController, PlatformMeController } from './platform-auth.controller';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [JwtModule.register({}), AuditModule],
  controllers: [PlatformAuthController, PlatformMeController],
  providers: [PlatformAuthService, PlatformAuthGuard],
  // JwtModule must be re-exported too: PlatformAuthGuard depends on JwtService,
  // and any module that imports PlatformAuthModule just to use the guard
  // (RestaurantsModule, DashboardModule) needs that dependency resolvable in
  // its own DI graph, not only inside this module.
  exports: [PlatformAuthGuard, JwtModule]
})
export class PlatformAuthModule {}
