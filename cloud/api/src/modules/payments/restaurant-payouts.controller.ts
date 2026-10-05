import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { RestaurantPayoutsService } from './restaurant-payouts.service';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  setBankVerificationSchema,
  SetBankVerificationDto,
  markPayoutPaidSchema,
  MarkPayoutPaidDto,
  holdPayoutSchema,
  HoldPayoutDto,
  releasePayoutSchema,
  ReleasePayoutDto,
  runEodBatchSchema,
  RunEodBatchDto
} from './dto/restaurant-payout.dto';

/**
 * The manual payout path while Razorpay Route is pending — see RestaurantPayoutsService's own doc comment. Routed
 * under /api/v1/payments/payouts so it inherits the existing 'billing' RBAC area (see common/rbac/access.ts),
 * the same area commission-config and admin-refund already use.
 */
@Controller('api/v1/payments/payouts')
@UseGuards(PlatformAuthGuard)
export class RestaurantPayoutsController {
  constructor(private readonly payouts: RestaurantPayoutsService) {}

  @Get('overview')
  overview() {
    return this.payouts.platformOverview();
  }

  @Post('run-eod')
  @UsePipes(new ZodValidationPipe(runEodBatchSchema))
  runEod(@Body() body: RunEodBatchDto) {
    return this.payouts.runEodBatch(body.businessDate);
  }

  @Get()
  list(@Query('restaurantId') restaurantId?: string, @Query('status') status?: string, @Query('page') page = '1', @Query('limit') limit = '25') {
    return this.payouts.list({ restaurantId, status, page: Math.max(1, Number(page) || 1), limit: Math.min(100, Math.max(1, Number(limit) || 25)) });
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.payouts.getById(id);
  }

  @Patch(':id/mark-paid')
  @UsePipes(new ZodValidationPipe(markPayoutPaidSchema))
  markPaid(@Param('id') id: string, @Body() body: MarkPayoutPaidDto, @CurrentPlatformUser() actor: PlatformUser) {
    return this.payouts.markPaid(id, body.utr, actor, body.password);
  }

  @Patch(':id/hold')
  @UsePipes(new ZodValidationPipe(holdPayoutSchema))
  hold(@Param('id') id: string, @Body() body: HoldPayoutDto, @CurrentPlatformUser() actor: PlatformUser) {
    return this.payouts.hold(id, body.reason, actor, body.password);
  }

  @Patch(':id/release')
  @UsePipes(new ZodValidationPipe(releasePayoutSchema))
  release(@Param('id') id: string, @Body() body: ReleasePayoutDto, @CurrentPlatformUser() actor: PlatformUser) {
    return this.payouts.release(id, actor, body.password);
  }

  @Patch('bank-verification/:restaurantId')
  @UsePipes(new ZodValidationPipe(setBankVerificationSchema))
  setBankVerification(@Param('restaurantId') restaurantId: string, @Body() body: SetBankVerificationDto, @CurrentPlatformUser() actor: PlatformUser) {
    return this.payouts.setBankVerification(restaurantId, body.status, actor, body.password);
  }
}
