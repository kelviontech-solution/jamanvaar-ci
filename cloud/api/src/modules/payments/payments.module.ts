import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { TenantAuthModule } from '../tenant-auth/tenant-auth.module';
import { MenuSyncController } from './menu-sync.controller';
import { MenuSyncService } from './menu-sync.service';
import { PaymentOrdersController } from './payment-orders.controller';
import { CashfreeWebhookController } from './cashfree-webhook.controller';
import { KioskPaymentConnectionController } from './kiosk-payment-connection.controller';
import { PlatformPaymentConnectionsController } from './platform-payment-connections.controller';
import { PaymentsService } from './payments.service';
import { CashfreeGatewayService } from './cashfree-gateway.service';
import { PaymentConnectionsService } from './payment-connections.service';

@Module({
  imports: [PrismaModule, AuditModule, TenantAuthModule],
  controllers: [
    MenuSyncController,
    PaymentOrdersController,
    CashfreeWebhookController,
    KioskPaymentConnectionController,
    PlatformPaymentConnectionsController
  ],
  providers: [PaymentsService, CashfreeGatewayService, MenuSyncService, PaymentConnectionsService],
  exports: [PaymentsService, CashfreeGatewayService]
})
export class PaymentsModule {}
