import { Body, Controller, Get, Param, Patch, Query, UseGuards, UsePipes } from '@nestjs/common';
import { PaymentTransactionStatus, PlatformUser } from '@prisma/client';
import { PlatformPaymentsService } from './platform-payments.service';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { setCommissionConfigSchema, SetCommissionConfigDto } from './dto/commission-config.dto';

@Controller('api/v1/payments')
@UseGuards(PlatformAuthGuard)
export class PlatformPaymentsController {
  constructor(private readonly platformPayments: PlatformPaymentsService) {}

  // Declared above the :paymentId route below — NestJS matches routes in
  // declaration order for the same HTTP method, and "commission-config"
  // would otherwise be captured by the :paymentId param route.
  @Get('commission-config')
  getCommissionConfig() {
    return this.platformPayments.getCommissionConfig();
  }

  @Patch('commission-config')
  @UsePipes(new ZodValidationPipe(setCommissionConfigSchema))
  setCommissionConfig(@Body() body: SetCommissionConfigDto, @CurrentPlatformUser() actor: PlatformUser) {
    return this.platformPayments.setDefaultCommissionBps(body.defaultBps, actor, body.password);
  }

  // Also declared above :paymentId — same route-ordering reason as commission-config.
  @Get('reconciliation-exceptions')
  listReconciliationExceptions(
    @Query('restaurantId') restaurantId?: string,
    @Query('status') status?: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED',
    @Query('page') page = '1',
    @Query('limit') limit = '25'
  ) {
    return this.platformPayments.listReconciliationExceptions({
      restaurantId,
      status,
      page: Math.max(1, Number(page) || 1),
      limit: Math.min(100, Math.max(1, Number(limit) || 25))
    });
  }

  @Patch('reconciliation-exceptions/:id/acknowledge')
  acknowledgeReconciliationException(@Param('id') id: string, @CurrentPlatformUser() actor: PlatformUser) {
    return this.platformPayments.acknowledgeReconciliationException(id, actor);
  }

  @Get()
  list(
    @Query('restaurantId') restaurantId?: string,
    @Query('status') status?: PaymentTransactionStatus,
    @Query('page') page = '1',
    @Query('limit') limit = '25'
  ) {
    return this.platformPayments.list({
      restaurantId,
      status,
      page: Math.max(1, Number(page) || 1),
      limit: Math.min(100, Math.max(1, Number(limit) || 25))
    });
  }

  @Get(':paymentId')
  detail(@Param('paymentId') paymentId: string) {
    return this.platformPayments.getById(paymentId);
  }
}
