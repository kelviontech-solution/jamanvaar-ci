/**
 * Load harness for QR ordering. Simulates guests against a RUNNING API: each guest gets a server-issued session, scans a table
 * code, reads the menu, and places orders with its own idempotency key. Prints outcome counts and latency percentiles.
 *
 *   npx tsx scripts/qr-load.ts --base http://localhost:4000 --tokens tokA,tokB --guests 200 --orders 2 --item dish --wave 50
 *
 * It creates real orders on the target: point it at a test restaurant. Never use it against production.
 */
export interface LoadOptions { base: string; tokens: string[]; guests: number; ordersPerGuest: number; itemId: string; wave: number; quantity?: number }
export interface LoadReport {
  guests: number;
  requests: number;
  seconds: number;
  ordersPerSecond: number;
  outcomes: Record<string, number>;
  latencyMs: Record<'menu' | 'order', { p50: number; p95: number; p99: number; max: number }>;
  duplicateOrderRefs: number;
}

const pct = (xs: number[], q: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))] : 0);
const summary = (xs: number[]) => ({ p50: pct(xs, 0.5), p95: pct(xs, 0.95), p99: pct(xs, 0.99), max: xs.length ? Math.max(...xs) : 0 });

export async function runLoad(o: LoadOptions): Promise<LoadReport> {
  const outcomes: Record<string, number> = {};
  const menuMs: number[] = [];
  const orderMs: number[] = [];
  const refs = new Set<string>();
  let dupes = 0;
  let requests = 0;
  const count = (k: string) => { outcomes[k] = (outcomes[k] ?? 0) + 1; };

  const timed = async (kind: 'menu' | 'order', fn: () => Promise<Response>) => {
    const t = Date.now();
    requests++;
    try {
      const res = await fn();
      (kind === 'menu' ? menuMs : orderMs).push(Date.now() - t);
      count(`${kind}:${res.status}`);
      return res;
    } catch {
      count(`${kind}:network-error`);
      return null;
    }
  };

  const guest = async (n: number) => {
    const token = o.tokens[n % o.tokens.length];
    const s = await fetch(`${o.base}/api/v1/public/qr/session`, { method: 'POST' }).then((r) => r.json() as Promise<{ session: string }>).catch(() => null);
    const headers = { 'content-type': 'application/json', ...(s ? { 'x-qr-session': s.session } : {}) };
    await timed('menu', () => fetch(`${o.base}/api/v1/public/qr/${token}/menu`, { headers }));
    for (let i = 0; i < o.ordersPerGuest; i++) {
      const body = { items: [{ itemId: o.itemId, quantity: o.quantity ?? 1, optionIds: [] }], idempotencyKey: `load-${Date.now()}-${n}-${i}-${Math.random().toString(36).slice(2)}` };
      const res = await timed('order', () => fetch(`${o.base}/api/v1/public/qr/${token}/orders`, { method: 'POST', headers, body: JSON.stringify(body) }));
      if (res && res.status === 201) {
        const ref = ((await res.json()) as { publicOrderId: string }).publicOrderId;
        if (refs.has(ref)) dupes++;
        refs.add(ref);
      } else if (res) {
        await res.arrayBuffer().catch(() => undefined);
      }
    }
  };

  const started = Date.now();
  for (let i = 0; i < o.guests; i += o.wave) await Promise.all(Array.from({ length: Math.min(o.wave, o.guests - i) }, (_, k) => guest(i + k)));
  const seconds = (Date.now() - started) / 1000;
  return { guests: o.guests, requests, seconds, ordersPerSecond: Math.round(((outcomes['order:201'] ?? 0) / Math.max(seconds, 0.001)) * 10) / 10, outcomes, latencyMs: { menu: summary(menuMs), order: summary(orderMs) }, duplicateOrderRefs: dupes };
}

const isMain = typeof process !== 'undefined' && process.argv[1] && /qr-load\.(ts|js|mjs)$/.test(process.argv[1]);
if (isMain) {
  const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
  const tokens = (arg('tokens') ?? '').split(',').filter(Boolean);
  if (!arg('base') || tokens.length === 0) {
    console.error('usage: qr-load --base <api url> --tokens <t1,t2,...> [--guests 100] [--orders 1] [--item <itemId>] [--wave 50]');
    process.exit(2);
  }
  runLoad({ base: arg('base')!.replace(/\/$/, ''), tokens, guests: Number(arg('guests', '100')), ordersPerGuest: Number(arg('orders', '1')), itemId: arg('item', 'dish')!, wave: Number(arg('wave', '50')) })
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => { console.error(e); process.exit(1); });
}
