import { Module } from '@nestjs/common';
import { TenantAuthModule } from '../tenant-auth/tenant-auth.module';
import { WhatsAppBillSettingsService } from './whatsapp-bill-settings.service';
import { WhatsAppBillSettingsTenantController } from './whatsapp-bill-settings.tenant.controller';

/**
 * Its own module (not part of the global NotificationsModule) so the tenant-auth guard's imports
 * can't create a cycle with everything that already imports NotificationsModule.
 */
@Module({
  imports: [TenantAuthModule],
  controllers: [WhatsAppBillSettingsTenantController],
  providers: [WhatsAppBillSettingsService]
})
export class WhatsAppBillModule {}
