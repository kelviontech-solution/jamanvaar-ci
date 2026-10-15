// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { QrApi } from '../apps/qr-guest/src/api';
afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
describe('QR order and payment recovery retain the signed browser session', () => {
  it('sends the original proof on status, retry, verification and counter fallback', async () => {
    const proof = 'original-server-signed-browser-session';
    sessionStorage.setItem('jv_qr_session2', proof);
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ publicOrderId: 'order-original', status: 'RECEIVED' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );
    // Each request consumes its own response body.
    fetch.mockImplementation(
      async () =>
        new Response(JSON.stringify({ publicOrderId: 'order-original', status: 'RECEIVED' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    vi.stubGlobal('fetch', fetch);
    await QrApi.status('order-original');
    await QrApi.retryPayment('order-original');
    await QrApi.verifyPayment('order-original', 'pay_verified', 'a'.repeat(64));
    await QrApi.switchToCounter('order-original');
    expect(fetch).toHaveBeenCalledTimes(4);
    for (const [, options] of fetch.mock.calls) {
      expect(new Headers(options.headers).get('X-QR-Session')).toBe(proof);
      expect(options.cache).toBe('no-store');
    }
  });
  it('never invents a proof when storage has no signed session', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ publicOrderId: 'legacy-order' }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await QrApi.status('legacy-order');
    expect(new Headers(fetch.mock.calls[0][1].headers).get('X-QR-Session')).toBeNull();
  });
});
