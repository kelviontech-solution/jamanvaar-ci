import { Module } from '@nestjs/common';
import { AiAssistantController } from './ai-assistant.controller';
import { TenantAiAssistantController } from './tenant-ai-assistant.controller';
import { DeviceAiAssistantController } from './device-ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { AuditModule } from '../audit/audit.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { TenantAuthModule } from '../tenant-auth/tenant-auth.module';

@Module({
  imports: [AuditModule, PlatformAuthModule, TenantAuthModule],
  controllers: [AiAssistantController, TenantAiAssistantController, DeviceAiAssistantController],
  providers: [AiAssistantService],
  exports: [AiAssistantService]
})
export class AiAssistantModule {}
