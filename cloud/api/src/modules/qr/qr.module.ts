import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { ApplicationEntitlementsModule } from '../application-entitlements/application-entitlements.module';
import { MenuPublicationsModule } from '../menu-publications/menu-publications.module';
import { OrderSyncModule } from '../order-sync/order-sync.module';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { QrMetrics } from './qr-metrics';
import { QrPublicController, QrRestaurantController, QrRuntimeController } from './qr.controllers';
import { QrLegacyGuestController } from './qr-legacy.controller';
import { QrAdminService } from './qr-admin.service';
import { QrMenuService } from './qr-menu.service';
import { QrPublicService } from './qr-public.service';
import { QrSettingsService } from './qr-settings.service';
import { QrSessions } from './qr-session';
import { QrAdmission } from './qr-resilience';
import { QrResolutionCache } from './qr-resolution-cache';
import { QrRateLimiter, QrRateLimitInterceptor } from './qr-rate-limit';

/**
 * QR ordering: one more channel into the platform's single order pipeline. It owns QR codes, QR settings and QR
 * analytics events. It owns no order table, no menu, no sync protocol and no entitlement logic of its own.
 */
@Module({
  imports: [PrismaModule, AuditModule, ApplicationEntitlementsModule, OrderSyncModule, MenuPublicationsModule, PlatformAuthModule],
  controllers: [QrPublicController, QrRestaurantController, QrLegacyGuestController, QrRuntimeController],
  providers: [QrPublicService, QrAdminService, QrMenuService, QrSettingsService, DeviceAuthGuard, QrRateLimiter, QrRateLimitInterceptor, QrSessions, QrAdmission, QrResolutionCache, QrMetrics],
  exports: [QrPublicService, QrAdminService, QrSettingsService, QrMenuService, QrAdmission]
})
export class QrModule {}
