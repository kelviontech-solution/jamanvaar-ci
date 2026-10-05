import { Body, Controller, ForbiddenException, Post, UseGuards, UsePipes } from '@nestjs/common';
import { Device } from '@prisma/client';
import { NotificationGatewayService } from './notification-gateway.service';
import { ReceiptEmailService } from './receipt-email.service';
import { sendReceiptSchema, SendReceiptDto, emailReceiptSchema, EmailReceiptDto } from './dto/send-receipt.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';

const RECEIPT_SENDER_DEVICE_TYPES = ['KIOSK', 'KIOSK_ADMIN', 'POS', 'POS_ADMIN'];

@Controller('api/v1/receipts')
@UseGuards(DeviceAuthGuard)
export class ReceiptsController {
  constructor(
    private readonly notifications: NotificationGatewayService,
    private readonly receiptEmail: ReceiptEmailService
  ) {}

  @Post('send')
  @UsePipes(new ZodValidationPipe(sendReceiptSchema))
  async send(@Body() body: SendReceiptDto, @CurrentDevice() device: Device) {
    if (!RECEIPT_SENDER_DEVICE_TYPES.includes(device.type)) {
      throw new ForbiddenException('This device type cannot send receipts');
    }
    if (body.channel === 'WHATSAPP') {
      return this.notifications.sendWhatsAppTemplate({ phoneNumber: body.phoneNumber, templateParams: body.templateParams });
    }
    return this.notifications.sendSms({ phoneNumber: body.phoneNumber, templateParams: body.templateParams });
  }

  @Post('email')
  @UsePipes(new ZodValidationPipe(emailReceiptSchema))
  async email(@Body() body: EmailReceiptDto, @CurrentDevice() device: Device) {
    if (!RECEIPT_SENDER_DEVICE_TYPES.includes(device.type)) {
      throw new ForbiddenException('This device type cannot send receipts');
    }
    return this.receiptEmail.sendBillEmail(device.restaurantId, body.orderId, body.email);
  }
}
