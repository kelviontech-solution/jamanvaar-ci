import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { WhatsAppOutboundWebhookService } from './whatsapp-outbound-webhook.service';

/**
 * Deliberately minimal and dependency-free (just Prisma) — see
 * WhatsAppOutboundWebhookService's own docstring for why this is a separate module rather
 * than living inside whatsapp-channel: both PaymentsModule and OrderSyncModule need to
 * inject this service, and WhatsAppChannelModule already imports PaymentsModule, so putting
 * it there would create a cycle.
 */
@Module({
  imports: [PrismaModule],
  providers: [WhatsAppOutboundWebhookService],
  exports: [WhatsAppOutboundWebhookService]
})
export class WhatsAppOutboundWebhookModule {}
