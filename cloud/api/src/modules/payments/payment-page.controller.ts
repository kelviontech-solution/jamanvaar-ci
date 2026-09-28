import { randomBytes } from 'crypto';
import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PaymentsService } from './payments.service';
import { paymentPageCsp, renderPaymentPage } from './payment-page.util';

/**
 * The page behind the kiosk's payment QR. No login: the payment's own unguessable id is the whole address, and the page shows only the
 * restaurant's name and the amount before handing over to Cashfree's checkout.
 */
@Controller('api/v1/pay')
export class PaymentPageController {
  constructor(private readonly payments: PaymentsService) {}

  @Get(':paymentId')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('X-Content-Type-Options', 'nosniff')
  async page(@Param('paymentId') paymentId: string, @Res({ passthrough: true }) res: Response): Promise<string> {
    const view = await this.payments.paymentPageView(paymentId);
    if (view.state === 'CLOSED') res.status(410);
    const nonce = randomBytes(16).toString('base64');
    res.setHeader('Content-Security-Policy', paymentPageCsp(nonce));
    return renderPaymentPage(view, nonce);
  }
}
