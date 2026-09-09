import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MenuSyncController } from './menu-sync.controller';
import { MenuSyncService } from './menu-sync.service';
import { PaymentOrdersController } from './payment-orders.controller';
import { CashfreeWebhookController } from './cashfree-webhook.controller';
import { PaymentsService } from './payments.service';
import { CashfreeGatewayService } from './cashfree-gateway.service';

@Module({
  imports: [PrismaModule],
  controllers: [MenuSyncController, PaymentOrdersController, CashfreeWebhookController],
  providers: [PaymentsService, CashfreeGatewayService, MenuSyncService],
  exports: [PaymentsService, CashfreeGatewayService]
})
export class PaymentsModule {}
