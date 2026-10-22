import {QrAttentionService} from './qr-attention.service';
import { QrMenuStatusService } from './qr-menu-status.service';
import {QrReceiptService} from './qr-receipt.service';
import {QrReceiptController} from './qr-receipt.controller';
import { QrRestaurantPageController, QrSiteLoyaltyController } from './qr-restaurant-page.controller';
import { QrRestaurantPageService } from './qr-restaurant-page.service';
import { TenantAuthModule } from '../tenant-auth/tenant-auth.module';
import { QrWorkflowsService } from './qr-workflows.service';
import { QrWorkflowsController } from './qr-workflows.controller';
import {QrCrmService} from './qr-crm.service';
import {QrCrmController} from './qr-crm.controller';
import {QrOperationsService} from './qr-operations.service';
import {QrOperationsController,QrOperationsPublicController} from './qr-operations.controller';
import { QrLoyaltyService } from './qr-loyalty.service';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { QrCacheFlushInterceptor } from './qr-cache-flush.interceptor';
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
import { PaymentsModule } from '../payments/payments.module';
import { QrAdvancedService } from './qr-advanced.service';
import { QrAdvancedController, QrAdvancedPublicController } from './qr-advanced.controller';
import { QrGroupService } from './qr-group.service';
import { QrGroupController } from './qr-group.controller';
import { QrPromotionsService } from './qr-promotions.service';
import { QrReservationsService } from './qr-reservations.service';
import { PlatformNotificationsModule } from '../platform-notifications/platform-notifications.module';

/**
 * QR ordering: one more channel into the platform's single order pipeline. It owns QR codes, QR settings and QR
 * analytics events. It owns no order table, no menu, no sync protocol and no entitlement logic of its own.
 */
@Module({
  imports: [TenantAuthModule, PrismaModule, AuditModule, ApplicationEntitlementsModule, OrderSyncModule, MenuPublicationsModule, PlatformAuthModule, PaymentsModule, PlatformNotificationsModule],
  controllers: [QrReceiptController,QrSiteLoyaltyController,QrRestaurantPageController,QrWorkflowsController,QrCrmController,QrOperationsController,QrOperationsPublicController,QrPublicController, QrRestaurantController, QrLegacyGuestController, QrRuntimeController, QrAdvancedController, QrAdvancedPublicController, QrGroupController],
  providers: [QrMenuStatusService,QrAttentionService,QrReceiptService,QrRestaurantPageService,QrWorkflowsService,QrCrmService,QrOperationsService,QrLoyaltyService, QrPromotionsService, QrGroupService, QrAdvancedService, QrPublicService, QrAdminService, QrMenuService, QrSettingsService, QrReservationsService, DeviceAuthGuard, QrRateLimiter, QrRateLimitInterceptor, QrSessions, QrAdmission, QrResolutionCache, QrMetrics, { provide: APP_INTERCEPTOR, useClass: QrCacheFlushInterceptor }],
  exports: [QrPublicService, QrAdminService, QrSettingsService, QrMenuService, QrAdmission]
})
export class QrModule {}
