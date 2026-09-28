import { Body, Controller, Get, Param, Patch, UseGuards, UsePipes } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { PaymentConnectionsService } from './payment-connections.service';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { setCommissionOverrideSchema, SetCommissionOverrideDto, stepUpPasswordSchema, StepUpPasswordDto } from './dto/commission-config.dto';

@Controller()
@UseGuards(PlatformAuthGuard)
export class PlatformPaymentConnectionsController {
  constructor(private readonly connections: PaymentConnectionsService) {}

  @Get('api/v1/payment-connections')
  list() {
    return this.connections.listForPlatform();
  }

  @Get('api/v1/restaurants/:id/payment-connection')
  detail(@Param('id') id: string) {
    return this.connections.getForPlatform(id);
  }

  @Patch('api/v1/restaurants/:id/payment-connection/approve')
  @UsePipes(new ZodValidationPipe(stepUpPasswordSchema))
  approve(@Param('id') id: string, @Body() body: StepUpPasswordDto, @CurrentPlatformUser() actor: PlatformUser) {
    return this.connections.approve(id, actor, body.password);
  }

  @Patch('api/v1/restaurants/:id/payment-connection/suspend')
  @UsePipes(new ZodValidationPipe(stepUpPasswordSchema))
  suspend(@Param('id') id: string, @Body() body: StepUpPasswordDto, @CurrentPlatformUser() actor: PlatformUser) {
    return this.connections.suspend(id, actor, body.password);
  }

  @Patch('api/v1/restaurants/:id/payment-connection/reactivate')
  reactivate(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.connections.reactivate(id, actor);
  }

  @Patch('api/v1/restaurants/:id/payment-connection/disconnect')
  @UsePipes(new ZodValidationPipe(stepUpPasswordSchema))
  disconnect(@Param('id') id: string, @Body() body: StepUpPasswordDto, @CurrentPlatformUser() actor: PlatformUser) {
    return this.connections.disconnect(id, actor, body.password);
  }

  @Patch('api/v1/restaurants/:id/payment-connection/refresh-status')
  refreshStatus(@Param('id') id: string) {
    return this.connections.refreshStatus(id);
  }

  @Patch('api/v1/restaurants/:id/payment-connection/commission')
  @UsePipes(new ZodValidationPipe(setCommissionOverrideSchema))
  setCommission(@Param('id') id: string, @Body() body: SetCommissionOverrideDto, @CurrentPlatformUser() actor: PlatformUser) {
    return this.connections.setCommissionOverride(id, body.overrideBps, actor, body.password);
  }
}
