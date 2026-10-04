import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { TenantAuthModule } from '../tenant-auth/tenant-auth.module';
import { OrderSyncModule } from '../order-sync/order-sync.module';
import { WhatsAppOutboundWebhookModule } from '../whatsapp-outbound/whatsapp-outbound-webhook.module';
import { MenuSyncController } from './menu-sync.controller';
import { MenuSyncService } from './menu-sync.service';
import { PaymentOrdersController } from './payment-orders.controller';
import { PaymentPageController } from './payment-page.controller';
import { CashfreeWebhookController } from './cashfree-webhook.controller';
import { RazorpayWebhookController } from './razorpay-webhook.controller';
import { RazorpayGatewayService } from './razorpay-gateway.service';
import { KioskPaymentConnectionController } from './kiosk-payment-connection.controller';
import { PlatformPaymentConnectionsController } from './platform-payment-connections.controller';
import { PlatformPaymentsController } from './platform-payments.controller';
import { PaymentsService } from './payments.service';
import { CashfreeGatewayService } from './cashfree-gateway.service';
import { PaymentConnectionsService } from './payment-connections.service';
import { PlatformPaymentsService } from './platform-payments.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';

@Module({
  imports: [PrismaModule, AuditModule, TenantAuthModule, OrderSyncModule, WhatsAppOutboundWebhookModule],
  controllers: [
    MenuSyncController,
    PaymentOrdersController,
    PaymentPageController,
    CashfreeWebhookController,
    RazorpayWebhookController,
    KioskPaymentConnectionController,
    PlatformPaymentConnectionsController,
    PlatformPaymentsController
  ],
  providers: [PaymentsService, CashfreeGatewayService, RazorpayGatewayService, MenuSyncService, PaymentConnectionsService, PlatformPaymentsService, PaymentReconciliationService],
  exports: [PaymentsService, CashfreeGatewayService, RazorpayGatewayService, PaymentReconciliationService]
})
export class PaymentsModule {}
