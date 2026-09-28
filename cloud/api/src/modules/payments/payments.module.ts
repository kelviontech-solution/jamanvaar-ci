import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { TenantAuthModule } from '../tenant-auth/tenant-auth.module';
import { MenuSyncController } from './menu-sync.controller';
import { MenuSyncService } from './menu-sync.service';
import { PaymentOrdersController } from './payment-orders.controller';
import { PaymentPageController } from './payment-page.controller';
import { CashfreeWebhookController } from './cashfree-webhook.controller';
import { KioskPaymentConnectionController } from './kiosk-payment-connection.controller';
import { PlatformPaymentConnectionsController } from './platform-payment-connections.controller';
import { PlatformPaymentsController } from './platform-payments.controller';
import { PaymentsService } from './payments.service';
import { CashfreeGatewayService } from './cashfree-gateway.service';
import { PaymentConnectionsService } from './payment-connections.service';
import { PlatformPaymentsService } from './platform-payments.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';

@Module({
  imports: [PrismaModule, AuditModule, TenantAuthModule],
  controllers: [
    MenuSyncController,
    PaymentOrdersController,
    PaymentPageController,
    CashfreeWebhookController,
    KioskPaymentConnectionController,
    PlatformPaymentConnectionsController,
    PlatformPaymentsController
  ],
  providers: [PaymentsService, CashfreeGatewayService, MenuSyncService, PaymentConnectionsService, PlatformPaymentsService, PaymentReconciliationService],
  exports: [PaymentsService, CashfreeGatewayService, PaymentReconciliationService]
})
export class PaymentsModule {}
