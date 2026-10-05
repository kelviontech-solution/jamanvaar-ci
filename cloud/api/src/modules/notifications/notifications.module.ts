import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { ReceiptsController } from './receipts.controller';
import { NotificationGatewayService } from './notification-gateway.service';
import { ReceiptEmailService } from './receipt-email.service';

/** Global so any module can send a transactional email without a per-module import. */
@Global()
@Module({
  controllers: [ReceiptsController],
  providers: [EmailService, NotificationGatewayService, ReceiptEmailService],
  exports: [EmailService]
})
export class NotificationsModule {}
