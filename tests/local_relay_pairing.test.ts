import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyValueStore } from '../packages/database/src/key_value_store';
import { LocalRelayConnection, readRelayEvents } from '../packages/database/src/local_relay_connection';

const values = new Map<string, string>();
const url = 'http://localhost:5298';
beforeEach(() => {
  values.clear(); KeyValueStore.reset();
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) });
  KeyValueStore.set('jamanvaar_tenant_id', 'restaurant-a');
  KeyValueStore.set('jamanvaar_bound_branch_id', 'branch-a');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function pairResponse(restaurant = 'restaurant-a', branch = 'branch-a') {
  return Response.json({ serviceKey: 'lc1.payload.signature', restaurant_id: restaurant, outlet_id: branch });
}
describe('restaurant-safe Local Core pairing client', () => {
  it('requires activation before making any pairing request', async () => {
    KeyValueStore.remove('jamanvaar_tenant_id'); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(LocalRelayConnection.pair(url, '123456')).rejects.toThrow('Activate'); expect(fetch).not.toHaveBeenCalled();
  });
  it('pairs once and authenticates API and SSE using headers, without putting the token in URLs', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(pairResponse()).mockResolvedValue(Response.json({})); vi.stubGlobal('fetch', fetch);
    await LocalRelayConnection.pair(url, '123456');
    await LocalRelayConnection.request(url, '/api/events');
    expect(fetch.mock.calls[0][1].body).toContain('restaurant-a');
    expect(fetch.mock.calls[1][0]).toBe(`${url}/api/events`);
    expect(fetch.mock.calls[1][1].headers.get('Authorization')).toBe('Bearer lc1.payload.signature');
  });
  it.each(['http://other-host:5298', 'https://localhost:5298'])('does not reuse a token for a different server %s', async other => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pairResponse())); await LocalRelayConnection.pair(url, '123456');
    expect(LocalRelayConnection.token(other)).toBeNull();
  });
  it.each(['jamanvaar_tenant_id', 'jamanvaar_bound_branch_id'])('does not reuse pairing when %s changes', async key => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pairResponse())); await LocalRelayConnection.pair(url, '123456');
    KeyValueStore.set(key, 'another'); expect(LocalRelayConnection.token(url)).toBeNull();
  });
  it('rejects old unscoped server responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ serviceKey: 'legacy-key' })));
    await expect(LocalRelayConnection.pair(url, '123456')).rejects.toThrow('version'); expect(LocalRelayConnection.token(url)).toBeNull();
  });
  it('returns a useful invalid-PIN error without saving credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'Invalid pairing PIN' }, { status: 401 })));
    await expect(LocalRelayConnection.pair(url, '123456')).rejects.toThrow('Invalid pairing PIN'); expect(LocalRelayConnection.token(url)).toBeNull();
  });
  it('discards stale pairing responses after changing restaurant', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { KeyValueStore.set('jamanvaar_tenant_id', 'restaurant-b'); return pairResponse(); }));
    await expect(LocalRelayConnection.pair(url, '123456')).rejects.toThrow('restaurant changed'); expect(LocalRelayConnection.token(url)).toBeNull();
  });
  it('handles CRLF and split UTF-8 SSE frames without losing or duplicating updates', async () => {
    const bytes = new TextEncoder().encode(': heartbeat\r\n\r\ndata: {"name":"₹"}\r\n\r\ndata: {"status":"READY"}\n\n');
    const stream = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
    const events: string[] = []; await readRelayEvents(new Response(stream), data => events.push(data));
    expect(events.map(v => JSON.parse(v))).toEqual([{ name: '₹' }, { status: 'READY' }]);
  });
});
