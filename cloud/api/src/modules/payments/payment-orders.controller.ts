import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards, UsePipes } from '@nestjs/common';
import { Device } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { createPaymentOrderSchema, CreatePaymentOrderDto } from './dto/create-payment-order.dto';
import { createRefundSchema, CreateRefundDto } from './dto/create-refund.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';

@Controller('api/v1/payments')
@UseGuards(DeviceAuthGuard)
export class PaymentOrdersController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('orders')
  @UsePipes(new ZodValidationPipe(createPaymentOrderSchema))
  async createOrder(@Body() body: CreatePaymentOrderDto, @CurrentDevice() device: Device) {
    if (device.type !== 'KIOSK' && device.type !== 'KIOSK_ADMIN') {
      throw new ForbiddenException('Only a Kiosk device can create a payment order');
    }
    return this.payments.createOrGetPaymentOrder(device.restaurantId, device.id, body);
  }

  @Get(':paymentId/status')
  async getStatus(@Param('paymentId') paymentId: string, @CurrentDevice() device: Device) {
    return this.payments.getPaymentStatus(device.restaurantId, paymentId);
  }

  @Post(':paymentId/refund')
  @UsePipes(new ZodValidationPipe(createRefundSchema))
  async refund(@Param('paymentId') paymentId: string, @Body() body: CreateRefundDto, @CurrentDevice() device: Device) {
    if (device.type !== 'POS' && device.type !== 'POS_ADMIN') {
      throw new ForbiddenException('Only a POS device can initiate a refund');
    }
    return this.payments.createRefund(device.restaurantId, paymentId, body);
  }
}
