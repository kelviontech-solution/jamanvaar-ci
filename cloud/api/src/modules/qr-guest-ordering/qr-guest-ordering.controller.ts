import { Body, Controller, Get, Param, Post, Query, UsePipes } from '@nestjs/common';
import { QrGuestOrderingService } from './qr-guest-ordering.service';
import { QrGuestOrderThrottle, QrGuestReadThrottle } from '../../common/throttle';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { placeQrGuestOrderSchema } from './dto/qr-guest-ordering.dto';

/**
 * BUG-119: the whole point of a table QR code is that a guest's own phone, which has never signed in to
 * anything and holds no device credential, can use it. Deliberately no guard here — the token itself, resolved
 * against QrTableLink, is the entire security boundary (see the service). Every response is scoped to exactly
 * the one restaurant and table the token belongs to; nothing here ever takes a restaurantId from the caller.
 */
@Controller('api/v1/qr-guest')
export class QrGuestOrderingController {
  constructor(private readonly qrGuest: QrGuestOrderingService) {}

  @Get('session')
  @QrGuestReadThrottle()
  getSession(@Query('token') token: string) {
    return this.qrGuest.getSession(token ?? '');
  }

  @Post('orders')
  @QrGuestOrderThrottle()
  @UsePipes(new ZodValidationPipe(placeQrGuestOrderSchema))
  placeOrder(@Body() body: ReturnType<typeof placeQrGuestOrderSchema.parse>) {
    return this.qrGuest.placeOrder(body);
  }

  @Get('orders/:externalOrderId')
  @QrGuestReadThrottle()
  getOrderStatus(@Param('externalOrderId') externalOrderId: string, @Query('token') token: string) {
    return this.qrGuest.getOrderStatus(externalOrderId, token ?? '');
  }
}
