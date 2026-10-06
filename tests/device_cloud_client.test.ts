import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EndpointResolver, CloudApiError, createDeviceCloudClient, entitySyncPullQuery } from '@jamanvaar/sync';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k)
  });
  vi.restoreAllMocks();
});

const make = () => createDeviceCloudClient({ keyPrefix: 'jamanvaar_test', apiBase: 'http://x', appVersion: '1.2.3' });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('createDeviceCloudClient', () => {
  it('derives storage keys from the prefix', () => {
    expect(make().keys).toEqual({
      restaurantId: 'jamanvaar_test_restaurant_id',
      deviceId: 'jamanvaar_test_device_id',
      deviceToken: 'jamanvaar_test_device_token'
    });
  });

  it('rejects with a 401 CloudApiError when the device is not activated', async () => {
    const err = await make().deviceFetch('/api/v1/x').catch((e) => e);
    expect(err).toBeInstanceOf(CloudApiError);
    expect(err.status).toBe(401);
    expect(err.message).toBe('Device not activated');
  });

  it('sends the Bearer token and surfaces server messages as CloudApiError', async () => {
    const c = make();
    store.set(c.keys.deviceToken, 'tok');
    const spy = vi.spyOn(EndpointResolver, 'fetch').mockResolvedValue(json({ message: 'nope' }, 409));
    const err = await c.pushOrderSync([]).catch((e) => e);
    expect(err).toBeInstanceOf(CloudApiError);
    expect(err).toMatchObject({ status: 409, message: 'nope' });
    const [path, init] = spy.mock.calls[0];
    expect(path).toBe('/api/v1/orders/sync');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' });
  });

  it('falls back to a status message when the error body has none', async () => {
    const c = make();
    store.set(c.keys.deviceToken, 'tok');
    vi.spyOn(EndpointResolver, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(c.pullEntitySync('staff')).rejects.toMatchObject({ status: 500, message: 'Entity sync pull failed (500)' });
  });

  it('leaseNumberBlock throws a plain Error on failure', async () => {
    const c = make();
    store.set(c.keys.deviceToken, 'tok');
    vi.spyOn(EndpointResolver, 'fetch').mockResolvedValue(json({ message: 'full' }, 400));
    await expect(c.leaseNumberBlock('KOT', 5)).rejects.toThrow('full');
  });

  it('reportHeartbeat does nothing without a token', async () => {
    const hook = vi.fn();
    const c = createDeviceCloudClient({ keyPrefix: 'p', apiBase: 'http://x', appVersion: '1', onBeforeHeartbeat: hook });
    await c.reportHeartbeat();
    expect(hook).not.toHaveBeenCalled();
  });
});

describe('entitySyncPullQuery', () => {
  it('builds the cursor query', () => {
    expect(entitySyncPullQuery()).toBe('?afterSeq=0');
    expect(entitySyncPullQuery('seq:42')).toBe('?afterSeq=42');
    expect(entitySyncPullQuery('2026-01-01T00:00:00Z')).toBe('?since=2026-01-01T00%3A00%3A00Z');
  });
});
