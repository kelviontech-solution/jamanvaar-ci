import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { TenantAuthModule } from '../tenant-auth/tenant-auth.module';
import { OrderSyncModule } from '../order-sync/order-sync.module';
import { WhatsAppOutboundWebhookModule } from '../whatsapp-outbound/whatsapp-outbound-webhook.module';
import { MenuSyncController } from './menu-sync.controller';
import { MenuSyncService } from './menu-sync.service';
import { PaymentOrdersController } from './payment-orders.controller';
import { RazorpayWebhookController } from './razorpay-webhook.controller';
import { RazorpayGatewayService } from './razorpay-gateway.service';
import { KioskPaymentConnectionController } from './kiosk-payment-connection.controller';
import { PlatformPaymentConnectionsController } from './platform-payment-connections.controller';
import { PlatformPaymentsController } from './platform-payments.controller';
import { RestaurantPayoutsController } from './restaurant-payouts.controller';
import { PaymentsService } from './payments.service';
import { PaymentConnectionsService } from './payment-connections.service';
import { PlatformPaymentsService } from './platform-payments.service';
import { RestaurantPayoutsService } from './restaurant-payouts.service';

@Module({
  imports: [PrismaModule, AuditModule, TenantAuthModule, OrderSyncModule, WhatsAppOutboundWebhookModule],
  controllers: [
    MenuSyncController,
    PaymentOrdersController,
    RazorpayWebhookController,
    KioskPaymentConnectionController,
    PlatformPaymentConnectionsController,
    // Registered before PlatformPaymentsController: Express/Nest try routes in registration order, and
    // PlatformPaymentsController's GET /api/v1/payments/:paymentId would otherwise shadow this controller's own
    // GET /api/v1/payments/payouts (NestJS has no route-specificity preference — whichever pattern is tried
    // first and matches wins, regardless of a literal segment vs. a param).
    RestaurantPayoutsController,
    PlatformPaymentsController
  ],
  providers: [PaymentsService, RazorpayGatewayService, MenuSyncService, PaymentConnectionsService, PlatformPaymentsService, RestaurantPayoutsService],
  exports: [PaymentsService, RazorpayGatewayService, RestaurantPayoutsService]
})
export class PaymentsModule {}
