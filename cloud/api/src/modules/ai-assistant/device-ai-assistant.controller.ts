import { Body, Controller, Get, Post, UseGuards, UsePipes } from '@nestjs/common';
import { Device } from '@prisma/client';
import { AiAssistantService } from './ai-assistant.service';
import { logTelemetrySchema } from './dto/ai-assistant.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';

/**
 * What POS, Captain and the other device-token apps use (BUG-056): they have no staff login, so the
 * tenant endpoint was unreachable for them. A terminal can only ever see its own restaurant's decision.
 */
@Controller('api/v1/devices/me')
@UseGuards(DeviceAuthGuard)
export class DeviceAiAssistantController {
  constructor(private readonly aiAssistant: AiAssistantService) {}

  @Get('ai-config')
  config(@CurrentDevice() device: Device) {
    return this.aiAssistant.getDeviceConfig(device.restaurantId);
  }

  @Post('ai-telemetry')
  @UsePipes(new ZodValidationPipe(logTelemetrySchema))
  telemetry(@CurrentDevice() device: Device, @Body() body: ReturnType<typeof logTelemetrySchema.parse>) {
    return this.aiAssistant.logTelemetry(device.restaurantId, body.intent, body.latencyMs);
  }
}
