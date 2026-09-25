import { describe, it, expect, beforeEach } from 'vitest';
import { EndpointResolver, isOperationalPath } from '../packages/sync/src/endpoint_resolver';

const CLOUD = 'https://cloud.example';
const CORE = 'http://192.168.1.20:5178';

function fakeFetch(behaviour: { core: 'up' | 'down'; cloud: 'up' | 'down' }) {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    const isCore = url.startsWith(CORE);
    const state = isCore ? behaviour.core : behaviour.cloud;
    if (state === 'down') throw new TypeError('fetch failed');
    return new Response(JSON.stringify({ from: isCore ? 'core' : 'cloud' }), { status: 200 });
  };
  return { fn, calls };
}

describe('EndpointResolver', () => {
  let clock = 0;
  beforeEach(() => {
    clock = 1_000_000;
    EndpointResolver.reset({ now: () => clock });
  });

  it('classifies which requests are operational (branch-local) and which are always cloud', () => {
    for (const p of ['/api/v1/orders/sync', '/api/v1/orders/sync?afterSeq=4', '/api/v1/inventory/movements', '/api/v1/sync/number-leases', '/api/v1/entity-sync/MENU_ITEM', '/api/v1/realtime/stream', '/api/v1/devices/me/heartbeat', '/api/v1/devices/me/commands', '/api/v1/devices/me/fleet']) {
      expect(isOperationalPath(p), p).toBe(true);
    }
    for (const p of ['/api/v1/activation/redeem', '/api/v1/payments/orders', '/api/v1/devices/me/restaurant', '/api/v1/qr-guest/session', '/api/v1/licensing/certificate']) {
      expect(isOperationalPath(p), p).toBe(false);
    }
  });

  it('uses the cloud when no Branch Core is configured', async () => {
    EndpointResolver.configure({ cloudBase: CLOUD });
    const f = fakeFetch({ core: 'up', cloud: 'up' });
    const res = await EndpointResolver.fetch('/api/v1/orders/sync', {}, f.fn as never);
    expect((await res.json()).from).toBe('cloud');
    expect(EndpointResolver.mode()).toBe('ONLINE');
  });

  it('prefers the Branch Core for operational traffic and the cloud for everything else', async () => {
    EndpointResolver.configure({ cloudBase: CLOUD, coreUrl: CORE });
    const f = fakeFetch({ core: 'up', cloud: 'up' });
    expect((await (await EndpointResolver.fetch('/api/v1/orders/sync', {}, f.fn as never)).json()).from).toBe('core');
    expect((await (await EndpointResolver.fetch('/api/v1/payments/orders', {}, f.fn as never)).json()).from).toBe('cloud');
  });

  it('with the internet down, operational traffic keeps working through the core (LOCAL mode)', async () => {
    EndpointResolver.configure({ cloudBase: CLOUD, coreUrl: CORE });
    const f = fakeFetch({ core: 'up', cloud: 'down' });
    await EndpointResolver.fetch('/api/v1/orders/sync', {}, f.fn as never);
    await expect(EndpointResolver.fetch('/api/v1/payments/orders', {}, f.fn as never)).rejects.toThrow();
    expect(EndpointResolver.mode()).toBe('LOCAL');
  });

  it('when the core is down, it falls back to the cloud for that same call and remembers the core is down for a while', async () => {
    EndpointResolver.configure({ cloudBase: CLOUD, coreUrl: CORE });
    const f = fakeFetch({ core: 'down', cloud: 'up' });
    const res = await EndpointResolver.fetch('/api/v1/orders/sync', {}, f.fn as never);
    expect((await res.json()).from).toBe('cloud');
    expect(EndpointResolver.lastResponder()).toBe('cloud');

    const before = f.calls.filter((u) => u.startsWith(CORE)).length;
    await EndpointResolver.fetch('/api/v1/orders/sync', {}, f.fn as never);
    expect(f.calls.filter((u) => u.startsWith(CORE)).length).toBe(before); // does not hammer a dead core
  });

  it('retries the core after the cool-down, and returns to it once it is healthy again', async () => {
    EndpointResolver.configure({ cloudBase: CLOUD, coreUrl: CORE });
    const behaviour = { core: 'down' as 'up' | 'down', cloud: 'up' as 'up' | 'down' };
    const f = fakeFetch(behaviour);
    await EndpointResolver.fetch('/api/v1/orders/sync', {}, f.fn as never);
    behaviour.core = 'up';
    clock += 60_000;
    const res = await EndpointResolver.fetch('/api/v1/orders/sync', {}, f.fn as never);
    expect((await res.json()).from).toBe('core');
  });

  it('with both unreachable it reports OFFLINE and the error is thrown to the caller (the caller queues locally)', async () => {
    EndpointResolver.configure({ cloudBase: CLOUD, coreUrl: CORE });
    const f = fakeFetch({ core: 'down', cloud: 'down' });
    await expect(EndpointResolver.fetch('/api/v1/orders/sync', {}, f.fn as never)).rejects.toThrow();
    expect(EndpointResolver.mode()).toBe('OFFLINE');
  });

  it('an application error from a reachable server (401, 409...) is not a connectivity failure and never triggers fallback', async () => {
    EndpointResolver.configure({ cloudBase: CLOUD, coreUrl: CORE });
    const calls: string[] = [];
    const fn = async (url: string) => { calls.push(url); return new Response('{}', { status: 409 }); };
    const res = await EndpointResolver.fetch('/api/v1/orders/sync', {}, fn as never);
    expect(res.status).toBe(409);
    expect(calls).toHaveLength(1);
    expect(EndpointResolver.mode()).toBe('LOCAL');
  });

  it('keeps a separate sync cursor per server, so a cursor from one is never used on the other', () => {
    EndpointResolver.configure({ cloudBase: CLOUD, coreUrl: CORE });
    expect(EndpointResolver.serverKeyFor('/api/v1/orders/sync')).toBe('core');
    expect(EndpointResolver.serverKeyFor('/api/v1/payments/orders')).toBe('cloud');
    EndpointResolver.configure({ cloudBase: CLOUD });
    expect(EndpointResolver.serverKeyFor('/api/v1/orders/sync')).toBe('cloud');
  });

  it('the realtime stream address follows the same routing', () => {
    EndpointResolver.configure({ cloudBase: CLOUD, coreUrl: CORE });
    expect(EndpointResolver.baseFor('/api/v1/realtime/stream')).toBe(CORE);
    EndpointResolver.configure({ cloudBase: CLOUD });
    expect(EndpointResolver.baseFor('/api/v1/realtime/stream')).toBe(CLOUD);
  });
});
