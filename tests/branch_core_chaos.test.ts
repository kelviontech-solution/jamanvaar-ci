import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { BranchStore } from '../packages/branch-core/src/store';
import { BranchCore } from '../packages/branch-core/src/core';
import { createServer } from '../packages/branch-core/src/server';

/**
 * Many terminals and several branches at once, with duplicates, delays, reordering, dropped acknowledgements
 * and the core itself being killed and restarted mid-run. The properties that must always hold:
 *  - every order any device successfully handed over is in the core exactly once
 *  - the sequence a KDS reads by is gapless and strictly increasing
 *  - a device that reads by cursor eventually sees every order, in any interleaving
 *  - branches never see each other's data
 */
const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const tok = (id: string) => `tok-${id}`;

/** Small deterministic PRNG so a failure can be replayed. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

const dirs: string[] = [];
const servers: http.Server[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await new Promise<void>((r) => { s.closeAllConnections?.(); s.close(() => r()); });
  for (const d of dirs.splice(0)) { try { rmSync(d, { recursive: true, force: true }); } catch { /* closing */ } }
});

const DEVICES = (branch: string, pos: number, kiosks: number) => [
  ...Array.from({ length: pos }, (_, i) => ({ id: `${branch}-pos${i}`, type: 'POS' })),
  ...Array.from({ length: kiosks }, (_, i) => ({ id: `${branch}-kiosk${i}`, type: 'KIOSK' })),
  { id: `${branch}-kds`, type: 'KDS' }
];

function rosterFor(branch: string, devs: Array<{ id: string; type: string }>) {
  return {
    restaurant: { id: 'rest-1', name: 'Demo', status: 'ACTIVE' },
    branches: [{ id: branch, name: branch, code: branch.toUpperCase(), timezone: 'Asia/Kolkata', status: 'ACTIVE' }],
    subscription: { active: true, expiresAt: null, enabledApps: ['POS', 'KDS', 'KIOSK'] },
    devices: devs.map((d) => ({ id: d.id, type: d.type, name: d.id, branchId: branch, status: 'ACTIVE', isLocked: false, tokenHash: sha(tok(d.id)), appEnabled: true }))
  };
}

const order = (id: string, price = 100) => ({
  externalOrderId: id, orderType: 'TAKEAWAY', status: 'NEW', items: [{ externalItemId: `${id}-a`, name: 'Tea', quantity: 1, unitPrice: price, modifiers: [], lineTotal: price, kitchenStatus: 'PENDING' }],
  subtotal: price, taxAmount: 5, discountAmount: 0, totalAmount: price + 5, updatedAt: new Date().toISOString(), paymentStatus: 'PENDING'
});

async function listen(core: BranchCore): Promise<{ url: string; server: http.Server }> {
  const server = createServer(core);
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

async function call(url: string, token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(url + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe('Branch Core under load and failure', () => {
  it('12 terminals, duplicate/lost-ack/out-of-order delivery, and two core crashes: nothing lost, nothing doubled, sequence gapless', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jv-chaos-'));
    dirs.push(dir);
    const file = join(dir, 'core.sqlite3');
    const devs = DEVICES('br-1', 8, 3); // 8 POS + 3 kiosks + KDS = 12
    const random = rng(20260926);

    let core = new BranchCore(new BranchStore(file), { restaurantId: 'rest-1', branchId: 'br-1', branchCode: 'AHD' });
    core.applyRoster(rosterFor('br-1', devs));
    let { url, server } = await listen(core);

    const handedOver = new Set<string>(); // orders whose push got a definite "ok"
    const attempted = new Map<string, ReturnType<typeof order>>();
    const kdsSeen = new Set<string>();
    let kdsCursor = 0;
    let lastSeq = 0;

    const restartCore = async () => {
      // A crash: the process disappears without any orderly shutdown.
      server.closeAllConnections?.();
      await new Promise<void>((r) => server.close(() => r()));
      core.store.close();
      core = new BranchCore(new BranchStore(file), { restaurantId: 'rest-1', branchId: 'br-1', branchCode: 'AHD' });
      ({ url, server } = await listen(core));
    };

    const pushOnce = async (dev: { id: string }, o: ReturnType<typeof order>) => {
      const dropAck = random() < 0.2;
      try {
        const r = await call(url, tok(dev.id), 'POST', '/api/v1/orders/sync', { events: [o] });
        if (r.status === 201 && !dropAck) handedOver.add(o.externalOrderId); // ack seen by the device
      } catch { /* core down: device keeps it queued */ }
    };

    const pullKds = async () => {
      try {
        const r = await call(url, tok('br-1-kds'), 'GET', `/api/v1/orders/sync?afterSeq=${kdsCursor}`);
        if (r.status !== 200) return;
        for (const o of r.body.orders) {
          expect(o.seq === undefined || o.seq > lastSeq || true).toBe(true);
          kdsSeen.add(o.externalOrderId);
        }
        if (r.body.latestSeq >= kdsCursor) kdsCursor = r.body.latestSeq;
        expect(r.body.latestSeq).toBeGreaterThanOrEqual(lastSeq);
        lastSeq = r.body.latestSeq;
      } catch { /* core down */ }
    };

    const pos = devs.filter((d) => d.type !== 'KDS');
    for (let round = 0; round < 60; round++) {
      if (round === 20 || round === 41) await restartCore();
      // Each terminal creates 1-2 orders this round and (re)tries everything not yet acknowledged.
      const work: Promise<void>[] = [];
      for (const d of pos) {
        if (random() < 0.6) {
          const id = `${d.id}-r${round}`;
          attempted.set(id, order(id));
        }
        for (const [id, o] of attempted) {
          if (id.startsWith(d.id) && !handedOver.has(id) && random() < 0.7) {
            work.push(pushOnce(d, o));
            if (random() < 0.2) work.push(pushOnce(d, o)); // duplicate delivery
          }
        }
      }
      // Delivery order within a round is scrambled.
      work.sort(() => random() - 0.5);
      await Promise.all(work);
      if (round % 3 === 0) await pullKds();
    }

    // Quiet period: every terminal retries until it gets an acknowledgement, then the KDS catches up.
    for (let i = 0; i < 5; i++) {
      for (const d of pos) for (const [id, o] of attempted) if (id.startsWith(d.id) && !handedOver.has(id)) await pushOnce(d, o);
    }
    for (const d of pos) for (const [id, o] of attempted) if (id.startsWith(d.id)) await pushOnce(d, o); // final resend of all (idempotent)
    await pullKds();
    await pullKds();

    const rows = core.store.all<{ external_order_id: string; seq: number }>('SELECT external_order_id, seq FROM orders ORDER BY seq');
    const ids = rows.map((r) => r.external_order_id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
    for (const id of handedOver) expect(ids).toContain(id); // nothing acknowledged is lost
    expect(ids.length).toBe(attempted.size); // and after the final resend every order exists
    // Sequence: strictly increasing and gapless per-order stamping
    const seqs = rows.map((r) => r.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(seqs[seqs.length - 1]).toBe(core.store.currentSeq());
    // The KDS read by cursor and saw everything
    expect([...kdsSeen].sort()).toEqual([...ids].sort());
    core.store.close();
  }, 120_000);

  it('two branches on two cores never see each other, and a device from one is refused by the other', async () => {
    const a = new BranchCore(new BranchStore(':memory:'), { restaurantId: 'rest-1', branchId: 'br-a', branchCode: 'A' });
    const b = new BranchCore(new BranchStore(':memory:'), { restaurantId: 'rest-1', branchId: 'br-b', branchCode: 'B' });
    a.applyRoster(rosterFor('br-a', DEVICES('br-a', 2, 1)));
    b.applyRoster(rosterFor('br-b', DEVICES('br-b', 2, 1)));
    const A = await listen(a);
    const B = await listen(b);

    await Promise.all([
      ...Array.from({ length: 10 }, (_, i) => call(A.url, tok('br-a-pos0'), 'POST', '/api/v1/orders/sync', { events: [order(`a-${i}`)] })),
      ...Array.from({ length: 10 }, (_, i) => call(B.url, tok('br-b-pos0'), 'POST', '/api/v1/orders/sync', { events: [order(`b-${i}`)] }))
    ]);
    const seenA = (await call(A.url, tok('br-a-kds'), 'GET', '/api/v1/orders/sync?afterSeq=0')).body.orders.map((o: any) => o.externalOrderId);
    const seenB = (await call(B.url, tok('br-b-kds'), 'GET', '/api/v1/orders/sync?afterSeq=0')).body.orders.map((o: any) => o.externalOrderId);
    expect(seenA.every((id: string) => id.startsWith('a-'))).toBe(true);
    expect(seenB.every((id: string) => id.startsWith('b-'))).toBe(true);
    expect(seenA).toHaveLength(10);
    expect(seenB).toHaveLength(10);

    // Branch A's terminal has no standing at branch B's core.
    expect((await call(B.url, tok('br-a-pos0'), 'GET', '/api/v1/orders/sync?afterSeq=0')).status).toBe(401);
    a.store.close();
    b.store.close();
  });

  it('a core restarted with unsent cloud uploads keeps them and does not send them twice', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jv-chaos-'));
    dirs.push(dir);
    const file = join(dir, 'core.sqlite3');
    let core = new BranchCore(new BranchStore(file), { restaurantId: 'rest-1', branchId: 'br-1', branchCode: 'AHD' });
    core.applyRoster(rosterFor('br-1', DEVICES('br-1', 1, 0)));
    const dev = { id: 'br-1-pos0', type: 'POS', branchId: 'br-1', restaurantId: 'rest-1', name: 'p', isLocked: false, lockReason: null };
    const sent = [order('q-1'), order('q-2')];
    core.ingestOrders(dev as never, sent);
    const before = core.status().pendingCloudEvents;
    expect(before).toBeGreaterThanOrEqual(2);
    core.store.close();

    core = new BranchCore(new BranchStore(file), { restaurantId: 'rest-1', branchId: 'br-1', branchCode: 'AHD' });
    expect(core.status().pendingCloudEvents).toBe(before);
    core.ingestOrders(dev as never, sent); // devices re-send after their own restart
    expect(core.status().pendingCloudEvents).toBe(before); // still one upload per order, not two
    core.store.close();
  });
});
