import { createHmac } from 'crypto';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CashfreeGatewayService } from './cashfree-gateway.service';

async function buildService(env: Record<string, string>): Promise<CashfreeGatewayService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      CashfreeGatewayService,
      { provide: ConfigService, useValue: { get: (key: string) => env[key] } }
    ]
  }).compile();
  return moduleRef.get(CashfreeGatewayService);
}

const CONFIGURED_ENV = {
  CASHFREE_CLIENT_ID: 'test-client',
  CASHFREE_CLIENT_SECRET: 'test-secret',
  CASHFREE_WEBHOOK_SECRET: 'test-secret',
  CASHFREE_ENVIRONMENT: 'sandbox',
  CASHFREE_API_VERSION: '2025-01-01'
};

describe('CashfreeGatewayService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('isConfigured() is false with no env vars set', async () => {
    const service = await buildService({});
    expect(service.isConfigured()).toBe(false);
  });

  it('createOrder throws ServiceUnavailableException when unconfigured', async () => {
    const service = await buildService({});
    await expect(
      service.createOrder({ orderId: 'pay_1', amountPaise: 10000, currency: 'INR', customerId: 'order_1' })
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('createOrder posts to the sandbox orders endpoint with the correct headers and body, converting paise to rupees', async () => {
    const service = await buildService(CONFIGURED_ENV);
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          cf_order_id: '12345',
          order_id: 'pay_1',
          payment_session_id: 'session_abc',
          order_status: 'ACTIVE'
        }),
        { status: 200 }
      )
    );

    const result = await service.createOrder({ orderId: 'pay_1', amountPaise: 12345, currency: 'INR', customerId: 'order_1' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://sandbox.cashfree.com/pg/orders');
    expect(init?.headers).toMatchObject({
      'x-client-id': 'test-client',
      'x-client-secret': 'test-secret',
      'x-api-version': '2025-01-01'
    });
    const body = JSON.parse(init!.body as string);
    expect(body.order_amount).toBe(123.45);
    expect(body.customer_details.customer_phone).toBeTypeOf('string');
    expect(result.paymentSessionId).toBe('session_abc');
    expect(result.orderStatus).toBe('ACTIVE');
  });

  it('createOrder throws when Cashfree responds with a non-2xx status', async () => {
    const service = await buildService(CONFIGURED_ENV);
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: 'bad request' }), { status: 400 }));
    await expect(
      service.createOrder({ orderId: 'pay_1', amountPaise: 100, currency: 'INR', customerId: 'order_1' })
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('verifyWebhookSignature accepts a correctly-signed payload', async () => {
    const service = await buildService(CONFIGURED_ENV);
    const rawBody = Buffer.from(JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK' }));
    const timestamp = '1700000000';
    const signature = createHmac('sha256', CONFIGURED_ENV.CASHFREE_WEBHOOK_SECRET)
      .update(timestamp + rawBody.toString('utf8'))
      .digest('base64');

    expect(service.verifyWebhookSignature(rawBody, timestamp, signature)).toBe(true);
  });

  it('verifyWebhookSignature rejects a tampered payload', async () => {
    const service = await buildService(CONFIGURED_ENV);
    const rawBody = Buffer.from(JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK' }));
    const timestamp = '1700000000';
    const signature = createHmac('sha256', CONFIGURED_ENV.CASHFREE_WEBHOOK_SECRET)
      .update(timestamp + rawBody.toString('utf8'))
      .digest('base64');
    const tamperedBody = Buffer.from(JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', extra: true }));

    expect(service.verifyWebhookSignature(tamperedBody, timestamp, signature)).toBe(false);
  });

  it('verifyWebhookSignature throws when CASHFREE_WEBHOOK_SECRET is unset', async () => {
    const service = await buildService({});
    expect(() => service.verifyWebhookSignature(Buffer.from('{}'), '1700000000', 'anything')).toThrow(
      ServiceUnavailableException
    );
  });
});
