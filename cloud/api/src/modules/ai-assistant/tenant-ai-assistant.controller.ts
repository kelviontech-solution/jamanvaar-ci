import { Body, Controller, Get, Post, UseGuards, UsePipes } from '@nestjs/common';
import { User } from '@prisma/client';
import { AiAssistantService } from './ai-assistant.service';
import { logTelemetrySchema } from './dto/ai-assistant.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TenantAuthGuard } from '../../common/guards/tenant-auth.guard';
import { CurrentTenantUser } from '../../common/decorators/current-tenant-user.decorator';

@Controller('api/v1/tenant/ai-assistant')
@UseGuards(TenantAuthGuard)
export class TenantAiAssistantController {
  constructor(private readonly aiAssistant: AiAssistantService) {}

  @Get('config')
  getTenantConfig(@CurrentTenantUser() user: User) {
    return this.aiAssistant.getTenantConfig(user.restaurantId);
  }

  @Post('telemetry/log')
  @UsePipes(new ZodValidationPipe(logTelemetrySchema))
  logTelemetry(
    @CurrentTenantUser() user: User,
    @Body() body: ReturnType<typeof logTelemetrySchema.parse>
  ) {
    return this.aiAssistant.logTelemetry(user.restaurantId, body.intent, body.queryText);
  }
}
