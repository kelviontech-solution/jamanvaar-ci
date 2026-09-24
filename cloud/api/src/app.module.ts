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
import { QrGuestOrderingModule } from './modules/qr-guest-ordering/qr-guest-ordering.module';
import { ApplicationEntitlementsModule } from './modules/application-entitlements/application-entitlements.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { OrderSyncModule } from './modules/order-sync/order-sync.module';
import { EntitySyncModule } from './modules/entity-sync/entity-sync.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { PlatformNotificationsModule } from './modules/platform-notifications/platform-notifications.module';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 120
      }
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
    QrGuestOrderingModule,
    ApplicationEntitlementsModule,
    PaymentsModule,
    OrderSyncModule,
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
