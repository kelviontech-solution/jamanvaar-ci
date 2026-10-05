import { Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { Device } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { RestaurantPayoutsService } from './restaurant-payouts.service';
import { createPaymentOrderSchema, CreatePaymentOrderDto } from './dto/create-payment-order.dto';
import { createRefundSchema, CreateRefundDto } from './dto/create-refund.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { DeviceSignatureGuard } from '../../common/guards/device-signature.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';
import { Throttle } from '@nestjs/throttler';
import { deviceTracker } from '../../common/throttle';

@Controller('api/v1/payments')
@UseGuards(DeviceAuthGuard, DeviceSignatureGuard)
export class PaymentOrdersController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly payouts: RestaurantPayoutsService
  ) {}

  @Throttle({ paymentOrder: { limit: 30, ttl: 60_000, getTracker: deviceTracker } })
  @Post('orders')
  @UsePipes(new ZodValidationPipe(createPaymentOrderSchema))
  async createOrder(@Body() body: CreatePaymentOrderDto, @CurrentDevice() device: Device) {
    if (device.type !== 'KIOSK' && device.type !== 'KIOSK_ADMIN') {
      throw new ForbiddenException('Only a Kiosk device can create a payment order');
    }
    return this.payments.createOrGetPaymentOrder(device.restaurantId, device.id, body);
  }

  @Get('tenant-summary')
  async tenantSummary(@CurrentDevice() device: Device, @Query('from') from?: string, @Query('to') to?: string) {
    if (device.type !== 'KIOSK_ADMIN' && device.type !== 'POS_ADMIN') {
      throw new ForbiddenException('Only Kiosk Admin or POS Admin can read the payments summary');
    }
    return this.payments.tenantSummary(device.restaurantId, { from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined });
  }

  @Get('tenant-recent')
  async tenantRecent(@CurrentDevice() device: Device, @Query('limit') limit?: string) {
    if (device.type !== 'KIOSK_ADMIN' && device.type !== 'POS_ADMIN') {
      throw new ForbiddenException('Only Kiosk Admin or POS Admin can list the restaurant\'s payments');
    }
    return this.payments.tenantRecent(device.restaurantId, Number(limit) || 30);
  }

  @Get('tenant-statement')
  async tenantStatement(@CurrentDevice() device: Device, @Query('date') date?: string) {
    if (device.type !== 'KIOSK_ADMIN' && device.type !== 'POS_ADMIN') {
      throw new ForbiddenException('Only Kiosk Admin or POS Admin can read the day statement');
    }
    return this.payments.tenantStatement(device.restaurantId, date);
  }

  /** Gross collection, Jamanvaar's fee, net payable, and how much of that is still pending payout vs already paid. */
  @Get('payout-summary')
  async payoutSummary(@CurrentDevice() device: Device) {
    if (device.type !== 'KIOSK_ADMIN' && device.type !== 'POS_ADMIN') {
      throw new ForbiddenException('Only Kiosk Admin or POS Admin can read the payout summary');
    }
    return this.payouts.restaurantSummary(device.restaurantId);
  }

  @Get('payout-history')
  async payoutHistory(@CurrentDevice() device: Device, @Query('page') page = '1', @Query('limit') limit = '25') {
    if (device.type !== 'KIOSK_ADMIN' && device.type !== 'POS_ADMIN') {
      throw new ForbiddenException('Only Kiosk Admin or POS Admin can read the payout history');
    }
    return this.payouts.restaurantPayoutHistory(device.restaurantId, Math.max(1, Number(page) || 1), Math.min(100, Math.max(1, Number(limit) || 25)));
  }

  @Throttle({ paymentStatus: { limit: 120, ttl: 60_000, getTracker: deviceTracker } })
  @Get(':paymentId/status')
  async getStatus(@Param('paymentId') paymentId: string, @CurrentDevice() device: Device) {
    return this.payments.getPaymentStatus(device.restaurantId, paymentId);
  }

  @Throttle({ paymentQr: { limit: 20, ttl: 60_000, getTracker: deviceTracker } })
  @Post(':paymentId/qr')
  async createQr(@Param('paymentId') paymentId: string, @CurrentDevice() device: Device) {
    if (device.type !== 'KIOSK' && device.type !== 'KIOSK_ADMIN') {
      throw new ForbiddenException('Only a Kiosk device can show a payment QR');
    }
    return this.payments.createUpiQr(device.restaurantId, paymentId);
  }

  @Post(':paymentId/kot-claim')
  async claimKitchenTicket(@Param('paymentId') paymentId: string, @CurrentDevice() device: Device) {
    if (device.type !== 'KIOSK') {
      throw new ForbiddenException('Only a kiosk can claim a kitchen ticket');
    }
    return this.payments.claimKitchenTicket(device.restaurantId, paymentId, { id: device.id, type: device.type });
  }

  @Post(':paymentId/fulfilled')
  async fulfilled(@Param('paymentId') paymentId: string, @CurrentDevice() device: Device) {
    if (device.type !== 'KIOSK' && device.type !== 'KIOSK_ADMIN' && device.type !== 'POS_ADMIN') {
      throw new ForbiddenException('This device cannot mark a payment fulfilled');
    }
    return this.payments.markFulfilled(device.restaurantId, paymentId, { id: device.id, type: device.type });
  }

  @Throttle({ paymentRefund: { limit: 10, ttl: 60_000, getTracker: deviceTracker } })
  @Post(':paymentId/refund')
  @UsePipes(new ZodValidationPipe(createRefundSchema))
  async refund(@Param('paymentId') paymentId: string, @Body() body: CreateRefundDto, @CurrentDevice() device: Device) {
    if (device.type !== 'POS' && device.type !== 'POS_ADMIN' && device.type !== 'KIOSK_ADMIN') {
      throw new ForbiddenException('Only POS, POS Admin or Kiosk Admin can initiate a refund');
    }
    return this.payments.createRefund(device.restaurantId, paymentId, body, { id: device.id, type: device.type });
  }
}
