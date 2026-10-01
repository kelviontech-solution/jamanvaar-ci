import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { ApplicationEntitlementsModule } from '../application-entitlements/application-entitlements.module';
import { WhatsAppOrderingAdminController } from './whatsapp-ordering-admin.controller';
import { WhatsAppOrderingAdminService } from './whatsapp-ordering-admin.service';

@Module({
  imports: [PrismaModule, PlatformAuthModule, ApplicationEntitlementsModule],
  controllers: [WhatsAppOrderingAdminController],
  providers: [WhatsAppOrderingAdminService]
})
export class WhatsAppOrderingAdminModule {}
