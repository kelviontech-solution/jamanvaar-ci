import { Body, Controller, ForbiddenException, NotFoundException, Post, UseGuards, UsePipes } from '@nestjs/common';
import { Device } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationGatewayService } from './notification-gateway.service';
import { ReceiptEmailService } from './receipt-email.service';
import { ReceiptWhatsAppService } from './receipt-whatsapp.service';
import { sendReceiptSchema, SendReceiptDto, emailReceiptSchema, EmailReceiptDto, whatsappReceiptSchema, WhatsappReceiptDto } from './dto/send-receipt.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';

const RECEIPT_SENDER_DEVICE_TYPES = ['KIOSK', 'KIOSK_ADMIN', 'POS', 'POS_ADMIN'];

@Controller('api/v1/receipts')
@UseGuards(DeviceAuthGuard)
export class ReceiptsController {
  constructor(
    private readonly notifications: NotificationGatewayService,
    private readonly receiptEmail: ReceiptEmailService,
    private readonly receiptWhatsApp: ReceiptWhatsAppService,
    private readonly prisma: PrismaService
  ) {}

  /**
   * security-audit LOW cloud-api-receipts-01: unlike /email and /whatsapp (both order-bound from
   * the start), /send took a bare phone number and template text with only a device-type check --
   * any restaurant's legitimately-issued POS/Kiosk token could message an arbitrary phone number
   * using the platform's own paid WhatsApp/SMS sending capacity, with no relationship to that
   * restaurant's own customers or orders. This proves the order is real and reachable by this
   * device, the same way /email and /whatsapp already do, without needing to build bill content
   * (the caller already has its own templateParams).
   */
  private async assertOrderReachable(restaurantId: string, orderId: string, branchId: string | null | undefined, requestingDevice: { id: string; type: string }): Promise<void> {
    const assertOwnKioskOrder = (ownerDeviceId: string | null) => {
      if (requestingDevice.type === 'KIOSK' && ownerDeviceId !== null && ownerDeviceId !== requestingDevice.id) throw new NotFoundException('Order not found');
    };
    const found = await this.prisma.runAsTenant(restaurantId, async (tx) => {
      const order = await tx.order.findUnique({ where: { restaurantId_externalOrderId: { restaurantId, externalOrderId: orderId } }, select: { branchId: true, kioskId: true } });
      if (order) {
        if (branchId && order.branchId && branchId !== order.branchId) throw new NotFoundException('Order not found');
        assertOwnKioskOrder(order.kioskId);
        return true;
      }
      const synced = await tx.syncedOrder.findUnique({ where: { restaurantId_externalOrderId: { restaurantId, externalOrderId: orderId } }, select: { branchId: true, deviceId: true } });
      if (synced) {
        if (branchId && synced.branchId && branchId !== synced.branchId) throw new NotFoundException('Order not found');
        assertOwnKioskOrder(synced.deviceId);
        return true;
      }
      return false;
    });
    if (!found) throw new NotFoundException('Order not found');
  }

  @Post('send')
  @UsePipes(new ZodValidationPipe(sendReceiptSchema))
  async send(@Body() body: SendReceiptDto, @CurrentDevice() device: Device) {
    if (!RECEIPT_SENDER_DEVICE_TYPES.includes(device.type)) {
      throw new ForbiddenException('This device type cannot send receipts');
    }
    await this.assertOrderReachable(device.restaurantId, body.orderId, device.branchId, { id: device.id, type: device.type });
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
    return this.receiptEmail.sendBillEmail(device.restaurantId, body.orderId, body.email, device.branchId, { id: device.id, type: device.type });
  }

  @Post('whatsapp')
  @UsePipes(new ZodValidationPipe(whatsappReceiptSchema))
  async whatsapp(@Body() body: WhatsappReceiptDto, @CurrentDevice() device: Device) {
    if (!RECEIPT_SENDER_DEVICE_TYPES.includes(device.type)) {
      throw new ForbiddenException('This device type cannot send receipts');
    }
    return this.receiptWhatsApp.sendBillWhatsApp(device.restaurantId, body.orderId, body.phone, device.branchId, { id: device.id, type: device.type });
  }
}
