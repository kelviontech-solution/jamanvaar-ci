import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// A tiny in-memory localStorage — this repo's vitest environment is 'node', not
// jsdom, so there is no global localStorage unless a test provides one (matches
// the existing convention in tests/captain_session_restore.test.ts).
vi.hoisted(() => {
  const data = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    get length() { return data.size; }
  } as Storage;
});

describe('pos-admin payment connection client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('omits empty-string optional fields from the submitted body', async () => {
    let capturedBody: any = null;
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ status: 'PENDING_VERIFICATION' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }) as unknown as typeof fetch;

    const { submitPaymentConnection } = await import('../apps/restaurant-system/pos-admin/src/cloud/cloudClient');

    await submitPaymentConnection({
      accountType: 'INDIVIDUAL',
      pan: 'ABCDE1234F',
      gst: '',
      contactName: 'Asha Patel',
      contactEmail: 'asha@example.com',
      contactPhone: '9999999999',
      settlementAccountNumber: '',
      settlementIfsc: ''
    });

    expect(capturedBody).not.toHaveProperty('gst');
    expect(capturedBody).not.toHaveProperty('settlementAccountNumber');
    expect(capturedBody).not.toHaveProperty('settlementIfsc');
    expect(capturedBody.pan).toBe('ABCDE1234F');
  });

  it('returns the parsed status from GET', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ACTIVE', settlementUpiVpa: 'asha@upi' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    ) as unknown as typeof fetch;

    const { getPaymentConnection } = await import('../apps/restaurant-system/pos-admin/src/cloud/cloudClient');
    const result = await getPaymentConnection();
    expect(result.status).toBe('ACTIVE');
    expect(result.settlementUpiVpa).toBe('asha@upi');
  });
});
