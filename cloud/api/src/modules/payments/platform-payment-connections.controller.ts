import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { PaymentConnectionsService } from './payment-connections.service';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';

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
  approve(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.connections.approve(id, actor);
  }

  @Patch('api/v1/restaurants/:id/payment-connection/suspend')
  suspend(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.connections.suspend(id, actor);
  }

  @Patch('api/v1/restaurants/:id/payment-connection/reactivate')
  reactivate(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.connections.reactivate(id, actor);
  }

  @Patch('api/v1/restaurants/:id/payment-connection/disconnect')
  disconnect(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.connections.disconnect(id, actor);
  }

  @Patch('api/v1/restaurants/:id/payment-connection/refresh-status')
  refreshStatus(@Param('id') id: string) {
    return this.connections.refreshStatus(id);
  }
}
