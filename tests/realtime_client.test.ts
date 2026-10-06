import { describe, it, expect } from 'vitest';
import { RealtimeClient, parseSseBlocks } from '../packages/sync/src/realtime_client';

const enc = new TextEncoder();

function streamOf(chunks: string[], hold = false): Response {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(enc.encode(chunks[i++]));
      } else if (!hold) {
        controller.close();
      } else {
        await new Promise(() => {}); // hold the connection open
      }
    }
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const tick = (ms = 20) => new Promise<void>((r) => setTimeout(r, ms));

describe('parseSseBlocks', () => {
  it('splits complete events and keeps a partial one for the next chunk', () => {
    const first = parseSseBlocks('event: ready\ndata: {"a":1}\n\nevent: change\ndata: {"kind":"or');
    expect(first.events).toEqual([{ event: 'ready', data: { a: 1 } }]);
    const second = parseSseBlocks(first.rest + 'ders"}\n\n');
    expect(second.events).toEqual([{ event: 'change', data: { kind: 'orders' } }]);
    expect(second.rest).toBe('');
  });

  it('ignores comments and malformed data instead of throwing', () => {
    const r = parseSseBlocks(': keepalive\n\nevent: change\ndata: not-json\n\n');
    expect(r.events).toEqual([{ event: 'change', data: null }]);
  });
});

describe('RealtimeClient', () => {
  it('connects with the device credential and reports change and command events', async () => {
    const seen: string[] = [];
    let auth = '';
    const client = new RealtimeClient({
      apiBase: 'http://x',
      deviceToken: 'tok',
      fetchImpl: (async (_url: string, init: RequestInit) => {
        auth = (init.headers as Record<string, string>).Authorization;
        return streamOf(['event: ready\ndata: {}\n\n', 'event: change\ndata: {"kind":"orders"}\n\n', 'event: command\ndata: {"kind":"command"}\n\n'], true);
      }) as never,
      onChange: (kind) => seen.push(`change:${kind}`),
      onCommand: () => seen.push('command'),
      debounceMs: 0
    });
    client.start();
    await tick(60);
    client.stop();
    expect(auth).toBe('Bearer tok');
    expect([...seen].sort()).toEqual(['change:orders', 'command']);
  });

  it('wakes at once for the first change of a burst, then collapses the rest into a single follow-up', async () => {
    const seen: string[] = [];
    const burst = Array.from({ length: 5 }, () => 'event: change\ndata: {"kind":"orders"}\n\n');
    const client = new RealtimeClient({
      apiBase: 'http://x', deviceToken: 't', fetchImpl: (async () => streamOf(['event: ready\ndata: {}\n\n', ...burst], true)) as never,
      onChange: (k) => seen.push(k), onCommand: () => {}, debounceMs: 30
    });
    client.start();
    await tick(120);
    client.stop();
    // 5 events: one immediate wake-up and one trailing one, not five.
    expect(seen).toEqual(['orders', 'orders']);
  });

  it('does not make the first change wait for the debounce window', async () => {
    const stamps: number[] = [];
    const t0 = Date.now();
    const client = new RealtimeClient({
      apiBase: 'http://x', deviceToken: 't', fetchImpl: (async () => streamOf(['event: ready\ndata: {}\n\n', 'event: change\ndata: {"kind":"orders"}\n\n'], true)) as never,
      onChange: () => stamps.push(Date.now() - t0), onCommand: () => {}, debounceMs: 400
    });
    client.start();
    await tick(100);
    client.stop();
    expect(stamps).toHaveLength(1);
    expect(stamps[0]).toBeLessThan(200);
  });

  it('reconnects with backoff after the stream drops, and gives up cleanly on stop', async () => {
    let connects = 0;
    const delays: number[] = [];
    const client = new RealtimeClient({
      apiBase: 'http://x', deviceToken: 't',
      fetchImpl: (async () => { connects++; return streamOf(['event: ready\ndata: {}\n\n']); }) as never,
      onChange: () => {}, onCommand: () => {},
      sleep: async (ms) => { delays.push(ms); await tick(1); }
    });
    client.start();
    await tick(80);
    client.stop();
    const at = connects;
    await tick(40);
    expect(connects).toBe(at);
    expect(connects).toBeGreaterThan(1);
    expect(delays.every((d) => d > 0)).toBe(true);
  });

  it('a revoked notice stops reconnecting and tells the app', async () => {
    let revoked = 0;
    let connects = 0;
    const client = new RealtimeClient({
      apiBase: 'http://x', deviceToken: 't',
      fetchImpl: (async () => { connects++; return streamOf(['event: revoked\ndata: {"reason":"DEVICE_NOT_ACTIVE"}\n\n']); }) as never,
      onChange: () => {}, onCommand: () => {}, onRevoked: () => { revoked++; }, sleep: async () => tick(1)
    });
    client.start();
    await tick(60);
    expect(revoked).toBe(1);
    expect(connects).toBe(1);
  });

  it('a 401/403 response is not retried in a tight loop', async () => {
    let connects = 0;
    const client = new RealtimeClient({
      apiBase: 'http://x', deviceToken: 't',
      fetchImpl: (async () => { connects++; return new Response('no', { status: 401 }); }) as never,
      onChange: () => {}, onCommand: () => {}, sleep: async () => tick(30)
    });
    client.start();
    await tick(50);
    client.stop();
    expect(connects).toBeLessThanOrEqual(3);
  });
});
