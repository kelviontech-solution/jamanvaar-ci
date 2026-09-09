import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { PaymentsService } from './payments.service';

@Controller('api/v1/payments/cashfree/webhook')
export class CashfreeWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @HttpCode(200)
  async handle(
    @Req() request: Request,
    @Headers('x-webhook-signature') signature: string | undefined,
    @Headers('x-webhook-timestamp') timestamp: string | undefined
  ) {
    // main.ts registers a path-scoped raw() parser for this route so
    // request.body is a Buffer in production; the test harness (which does
    // not run bootstrap()'s raw() registration) sends a JSON body that lands
    // here as an already-parsed object, so both shapes are normalized here.
    const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.from(JSON.stringify(request.body ?? {}), 'utf8');
    await this.payments.processCashfreeWebhook(rawBody, signature, timestamp);
    return { received: true };
  }
}
