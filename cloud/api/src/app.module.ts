import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuditQueryModule } from './modules/audit-query/audit-query.module';
import { PlatformAuthModule } from './modules/platform-auth/platform-auth.module';
import { RestaurantsModule } from './modules/restaurants/restaurants.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { PlansModule } from './modules/plans/plans.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { ActivationKeysModule } from './modules/activation-keys/activation-keys.module';
import { DevicesModule } from './modules/devices/devices.module';
import { BranchesModule } from './modules/branches/branches.module';
import { OwnersModule } from './modules/owners/owners.module';
import { SystemHealthModule } from './modules/system-health/system-health.module';
import { SessionsModule } from './modules/sessions/sessions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    AuditQueryModule,
    PlatformAuthModule,
    RestaurantsModule,
    DashboardModule,
    PlansModule,
    SubscriptionsModule,
    ActivationKeysModule,
    DevicesModule,
    BranchesModule,
    OwnersModule,
    SystemHealthModule,
    SessionsModule
  ]
})
export class AppModule {}
