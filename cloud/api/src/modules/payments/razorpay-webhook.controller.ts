import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { PaymentsService } from './payments.service';

// Razorpay retries any delivery that is not answered 200, so this route is never throttled.
@SkipThrottle()
@Controller('api/v1/payments/razorpay/webhook')
export class RazorpayWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @HttpCode(200)
  async handle(@Req() request: Request, @Headers('x-razorpay-signature') signature: string | undefined) {
    const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.from(JSON.stringify(request.body ?? {}), 'utf8');
    await this.payments.processRazorpayWebhook(rawBody, signature);
    return { received: true };
  }
}
