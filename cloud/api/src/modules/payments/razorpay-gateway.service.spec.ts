import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { RazorpayGatewayService } from './razorpay-gateway.service';

function makeService(env: Record<string, string | undefined>) {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  return new RazorpayGatewayService(config);
}

describe('RazorpayGatewayService', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a single-use fixed-amount UPI QR with basic auth and returns its image url', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'qr_1', image_url: 'https://rzp.io/img/qr_1.png', status: 'active' }), { status: 200 }));
    const svc = makeService({ RAZORPAY_KEY_ID: 'rzp_test_id', RAZORPAY_KEY_SECRET: 'secret' });

    const result = await svc.createUpiQr({ paymentRef: 'pay-ref-1', amountPaise: 100, closeByUnix: 1_900_000_000 });

    expect(result).toEqual({ qrId: 'qr_1', imageUrl: 'https://rzp.io/img/qr_1.png', status: 'active' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.razorpay.com/v1/payments/qr_codes');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('rzp_test_id:secret').toString('base64')}`);
    expect(JSON.parse(init.body as string)).toMatchObject({
      type: 'upi_qr',
      usage: 'single_use',
      fixed_amount: true,
      payment_amount: 100,
      close_by: 1_900_000_000,
      notes: { payment_ref: 'pay-ref-1' }
    });
  });

  it('surfaces Razorpay error descriptions when QR creation is refused', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { description: 'Route is not enabled' } }), { status: 400 }));
    const svc = makeService({ RAZORPAY_KEY_ID: 'rzp_test_id', RAZORPAY_KEY_SECRET: 'secret' });

    await expect(svc.createUpiQr({ paymentRef: 'pay-ref-1', amountPaise: 100, closeByUnix: 1_900_000_000 })).rejects.toThrow('Razorpay QR creation failed: Route is not enabled');
  });

  it('refuses to call Razorpay when the keys are missing', async () => {
    const svc = makeService({});
    await expect(svc.createUpiQr({ paymentRef: 'pay-ref-1', amountPaise: 100, closeByUnix: 1_900_000_000 })).rejects.toThrow('RAZORPAY_KEY_ID');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a webhook signed with the webhook secret and rejects any other body', () => {
    const body = Buffer.from('{"event":"payment.captured"}');
    const signature = createHmac('sha256', 'whsec').update(body).digest('hex');
    const svc = makeService({ RAZORPAY_WEBHOOK_SECRET: 'whsec' });

    expect(svc.verifyWebhookSignature(body, signature)).toBe(true);
    expect(svc.verifyWebhookSignature(Buffer.from('{"event":"payment.failed"}'), signature)).toBe(false);
    expect(svc.verifyWebhookSignature(body, 'short')).toBe(false);
  });
});
