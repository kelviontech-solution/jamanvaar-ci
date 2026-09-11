import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { PaymentTransactionStatus } from '@prisma/client';
import { PlatformPaymentsService } from './platform-payments.service';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';

@Controller('api/v1/payments')
@UseGuards(PlatformAuthGuard)
export class PlatformPaymentsController {
  constructor(private readonly platformPayments: PlatformPaymentsService) {}

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
