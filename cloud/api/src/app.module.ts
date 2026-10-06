import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuditQueryModule } from './modules/audit-query/audit-query.module';
import { PlatformAuthModule } from './modules/platform-auth/platform-auth.module';
import { TenantAuthModule } from './modules/tenant-auth/tenant-auth.module';
import { RestaurantsModule } from './modules/restaurants/restaurants.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { PlansModule } from './modules/plans/plans.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { ActivationKeysModule } from './modules/activation-keys/activation-keys.module';
import { DevicesModule } from './modules/devices/devices.module';
import { BranchesModule } from './modules/branches/branches.module';
import { OwnersModule } from './modules/owners/owners.module';
import { PlatformUsersModule } from './modules/platform-users/platform-users.module';
import { SupportTicketsModule } from './modules/support-tickets/support-tickets.module';
import { SystemHealthModule } from './modules/system-health/system-health.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { BillingModule } from './modules/billing/billing.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { SupportModule } from './modules/support/support.module';
import { PlatformSettingsModule } from './modules/platform-settings/platform-settings.module';
import { LicensingModule } from './modules/licensing/licensing.module';
import { BackupsModule } from './modules/backups/backups.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DeviceCommandsModule } from './modules/device-commands/device-commands.module';
import { MasterCatalogModule } from './modules/master-catalog/master-catalog.module';
import { SyncObservabilityModule } from './modules/sync-observability/sync-observability.module';
import { OfflinePolicyModule } from './modules/offline-policy/offline-policy.module';
import { SandboxesModule } from './modules/sandboxes/sandboxes.module';
import { AiAssistantModule } from './modules/ai-assistant/ai-assistant.module';
import { QrOrderingModule } from './modules/qr-ordering/qr-ordering.module';
import { WhatsAppChannelModule } from './modules/whatsapp-channel/whatsapp-channel.module';
import { WhatsAppOrderingAdminModule } from './modules/whatsapp-ordering-admin/whatsapp-ordering-admin.module';
import { QrModule } from './modules/qr/qr.module';
import { ApplicationEntitlementsModule } from './modules/application-entitlements/application-entitlements.module';
import { FeaturesModule } from './modules/features/features.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { OrderSyncModule } from './modules/order-sync/order-sync.module';
import { InventoryLedgerModule } from './modules/inventory-ledger/inventory-ledger.module';
import { MenuPublicationsModule } from './modules/menu-publications/menu-publications.module';
import { RealtimeModule } from './common/realtime/realtime.module';
import { EntitySyncModule } from './modules/entity-sync/entity-sync.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { PlatformNotificationsModule } from './modules/platform-notifications/platform-notifications.module';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    // Under test, test/setup.ts has already loaded .env into process.env and then removed the developer's
    // real payment keys; re-reading the file here would silently put them back.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, ignoreEnvFile: process.env.NODE_ENV === 'test' }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 120
      },
      // Phase 7 of the Jamanvaar WhatsApp connector (docs/integrations/
      // JAMANVAAR_WHATSAPP_CONNECTOR_IMPLEMENTATION_PLAN.md): every NAMED throttler here is
      // evaluated by the one global ThrottlerGuard (below) against EVERY route in the whole
      // app, not just whatsapp-channel's -- a route that doesn't explicitly override a given
      // name via its own @Throttle(...) still gets checked against it using this module-level
      // limit/ttl and the default per-IP tracker. So each of these four is registered with a
      // limit high enough to never realistically trip on an unrelated route, and only
      // whatsapp-channel.service.controller.ts's own @Throttle({name: {limit, ttl, getTracker}})
      // overrides it down to the real, tight, per-restaurant (or per-restaurant-per-customer-
      // phone) cap described there. Getting this backwards -- registering the real tight limit
      // here -- would rate-limit every other endpoint in the platform to the same tiny budget,
      // tracked by IP, which is exactly the global-default problem this split was meant to fix.
      { name: 'whatsappSvc', ttl: 60_000, limit: 1_000_000 },
      { name: 'whatsappCheckout', ttl: 60_000, limit: 1_000_000 },
      { name: 'whatsappCheckoutPerCustomer', ttl: 10 * 60_000, limit: 1_000_000 },
      { name: 'whatsappValidateKey', ttl: 60_000, limit: 1_000_000 },
      // Payment routes: tightened per route with @Throttle, keyed by device token (see common/throttle.ts).
      { name: 'paymentOrder', ttl: 60_000, limit: 1_000_000 },
      { name: 'paymentQr', ttl: 60_000, limit: 1_000_000 },
      { name: 'paymentStatus', ttl: 60_000, limit: 1_000_000 },
      { name: 'paymentRefund', ttl: 60_000, limit: 1_000_000 },
      { name: 'tenantRefresh', ttl: 60_000, limit: 1_000_000 }
    ]),
    PrismaModule,
    NotificationsModule,
    AuditModule,
    AuditQueryModule,
    PlatformAuthModule,
    TenantAuthModule,
    RestaurantsModule,
    DashboardModule,
    PlansModule,
    SubscriptionsModule,
    ActivationKeysModule,
    DevicesModule,
    BranchesModule,
    OwnersModule,
    PlatformUsersModule,
    SupportTicketsModule,
    SystemHealthModule,
    SessionsModule,
    BillingModule,
    ApplicationsModule,
    SupportModule,
    PlatformSettingsModule,
    LicensingModule,
    BackupsModule,
    ReportsModule,
    DeviceCommandsModule,
    MasterCatalogModule,
    SyncObservabilityModule,
    OfflinePolicyModule,
    SandboxesModule,
    AiAssistantModule,
    QrOrderingModule,
    QrModule,
    WhatsAppChannelModule,
    WhatsAppOrderingAdminModule,
    ApplicationEntitlementsModule,
    FeaturesModule,
    PaymentsModule,
    OrderSyncModule,
    InventoryLedgerModule,
    MenuPublicationsModule,
    RealtimeModule,
    EntitySyncModule,
    JobsModule,
    PlatformNotificationsModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    }
  ]
})
export class AppModule {}
