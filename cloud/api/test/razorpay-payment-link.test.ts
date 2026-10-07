import { afterEach, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { RazorpayGatewayService } from '../src/modules/payments/razorpay-gateway.service';
import { customerKitchenStatus } from '../src/modules/qr/qr.support';

const gateway = () => new RazorpayGatewayService(new ConfigService({ RAZORPAY_KEY_ID: 'qa', RAZORPAY_KEY_SECRET: 'qa-only' }));
const input = { referenceId: 'qa-reference', amountPaise: 209800, description: 'Restaurant order QR-7', customerName: '', customerPhone: '', expireByUnix: Math.floor(Date.now() / 1000) + 1800, callbackUrl: 'https://example.com/q/qa?order=qa' };
afterEach(() => vi.unstubAllGlobals());

it('anonymous mobile checkout omits customer entirely rather than sending the rejected empty JSON object', async () => {
  const network = vi.fn(async (_url, init) => {
    const body = JSON.parse(init.body);
    expect(body).not.toHaveProperty('customer');
    expect(body).toMatchObject({ amount: 209800, currency: 'INR', accept_partial: false, callback_method: 'get', notify: { sms: false, email: false } });
    return new Response(JSON.stringify({ id: 'plink_qa', short_url: 'https://rzp.io/i/qa', status: 'created' }));
  });
  vi.stubGlobal('fetch', network);
  expect(await gateway().createPaymentLink(input)).toMatchObject({ linkId: 'plink_qa' });
  expect(network).toHaveBeenCalledTimes(1);
});
it('trims guest names and normalizes entered phone spacing for the provider', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    expect(JSON.parse(init.body).customer).toEqual({ name: 'Guest', contact: '+919876543210' });
    return new Response(JSON.stringify({ id: 'plink_qa', short_url: 'https://rzp.io/i/qa', status: 'created' }));
  }));
  await gateway().createPaymentLink({ ...input, customerName: ' Guest ', customerPhone: '+91 98765-43210' });
});
it('provider rejection is distinguishable from an unknown POST result', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { description: 'incorrect JSON object' } }), { status: 400 })));
  await expect(gateway().createPaymentLink(input)).rejects.toMatchObject({ response: { code: 'PAYMENT_LINK_REJECTED' } });
});
it('provider server errors remain ambiguous and cannot authorize another charge or cash collection', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { description: 'Internal error' } }), { status: 500 })));
  await expect(gateway().createPaymentLink(input)).rejects.toMatchObject({ response: { code: 'UPSTREAM_RESULT_UNKNOWN' } });
});
it('malformed successful provider responses cannot be treated as absent or safe payment attempts', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
  await expect(gateway().createPaymentLink(input)).rejects.toMatchObject({ response: { code: 'UPSTREAM_RESULT_UNKNOWN' } });
  await expect(gateway().findPaymentLink(input.referenceId)).rejects.toThrow('unreadable status');
});
it('served food completes the guest flow even though the cashier has not settled the bill', () => {
  expect(customerKitchenStatus('READY', [{ kitchenStatus: 'SERVED' }, { kitchenStatus: 'CANCELLED' }])).toBe('COMPLETED');
  expect(customerKitchenStatus('READY', [{ kitchenStatus: 'SERVED' }, { kitchenStatus: 'READY' }])).toBe('READY');
  expect(customerKitchenStatus('COMPLETED', [{ kitchenStatus: 'PREPARING' }])).toBe('PREPARING');
  expect(customerKitchenStatus('CANCELLED', [{ kitchenStatus: 'SERVED' }])).toBe('CANCELLED');
});
