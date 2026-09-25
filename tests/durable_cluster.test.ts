import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqlKvEngine } from '../packages/database/src/durable/sql_kv_engine';
import { NodeSqliteDriver } from '../packages/database/src/durable/node_driver';
import { DurableStorage, EngineBackend } from '../packages/database/src/durable/durable_storage';
import { ClusterBackend, type Locks, type Channel } from '../packages/database/src/durable/cluster_backend';

/** A shared in-memory stand-in for the browser's Web Locks and BroadcastChannel, so windows can be started and killed. */
class FakeBrowser {
  private held = false;
  private waiters: Array<() => void> = [];
  private channels = new Set<FakeChannel>();
  private releaseHolder: (() => void) | null = null;

  locks(): Locks {
    return {
      request: (_name, optsOrCb: any, maybeCb?: any) => {
        const opts = typeof optsOrCb === 'function' ? {} : optsOrCb;
        const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
        if (opts.ifAvailable) {
          if (this.held) return Promise.resolve(cb(null));
          this.held = true;
          return this.run(cb);
        }
        return new Promise((resolve) => {
          const go = () => { this.held = true; resolve(this.run(cb)); };
          if (!this.held) go(); else this.waiters.push(go);
        });
      }
    };
  }

  private run(cb: (lock: object | null) => unknown): Promise<unknown> {
    return new Promise((resolve) => {
      const result = cb({});
      Promise.resolve(result).then(resolve);
      this.releaseHolder = () => { this.held = false; const next = this.waiters.shift(); if (next) next(); };
    });
  }

  /** The current leader window closes: its lock is released. */
  releaseLeader() { this.releaseHolder?.(); }

  channel(): Channel {
    const c = new FakeChannel(this);
    this.channels.add(c);
    return c;
  }

  deliver(from: FakeChannel, data: unknown) {
    for (const c of this.channels) if (c !== from && !c.closed) queueMicrotask(() => c.onmessage?.({ data: structuredClone(data) }));
  }
}

class FakeChannel implements Channel {
  onmessage: ((e: { data: any }) => void) | null = null;
  closed = false;
  constructor(private readonly bus: FakeBrowser) {}
  postMessage(m: unknown) { this.bus.deliver(this, m); }
  close() { this.closed = true; }
}

let dir: string;
const file = () => join(dir, 'cluster.sqlite3');
const tick = (ms = 15) => new Promise((r) => setTimeout(r, ms));

function openWindow(browser: FakeBrowser, id: string, opts: { requestTimeoutMs?: number } = {}) {
  const leaderBackend = () => new EngineBackend(new SqlKvEngine(new NodeSqliteDriver(file())));
  const cluster = new ClusterBackend({ name: 'jv', windowId: id, locks: browser.locks(), makeChannel: () => browser.channel(), makeLeaderBackend: leaderBackend, requestTimeoutMs: opts.requestTimeoutMs ?? 300, snapshotTimeoutMs: 200 });
  return DurableStorage.open(cluster, { retryMs: 20 }).then((storage) => ({ storage, cluster }));
}

describe('ClusterBackend', () => {
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'jv-cluster-')); });
  afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* still closing */ } });

  it('the first window becomes leader and persists; a later window is a follower that receives the current data', async () => {
    const browser = new FakeBrowser();
    const a = await openWindow(browser, 'A');
    expect(a.cluster.isLeader).toBe(true);
    a.storage.setItem('orders', JSON.stringify([{ id: 'o1' }]));
    await a.storage.flush();

    const b = await openWindow(browser, 'B');
    expect(b.cluster.isLeader).toBe(false);
    expect(JSON.parse(b.storage.getItem('orders')!)).toEqual([{ id: 'o1' }]);
  });

  it('a follower\'s write is persisted by the leader and appears in every window', async () => {
    const browser = new FakeBrowser();
    const a = await openWindow(browser, 'A');
    const b = await openWindow(browser, 'B');
    const c = await openWindow(browser, 'C');

    b.storage.setItem('cfg', 'from-b');
    await b.storage.flush();
    await tick();
    expect(a.storage.getItem('cfg')).toBe('from-b');
    expect(c.storage.getItem('cfg')).toBe('from-b');

    a.storage.setItem('cfg2', 'from-leader');
    await a.storage.flush();
    await tick();
    expect(b.storage.getItem('cfg2')).toBe('from-leader');
    expect(c.storage.getItem('cfg2')).toBe('from-leader');
  });

  it('other windows are told when data changes so the app can reload it', async () => {
    const browser = new FakeBrowser();
    const a = await openWindow(browser, 'A');
    const b = await openWindow(browser, 'B');
    const seen: string[] = [];
    b.storage.onRemoteChange = (ops) => ops.forEach((o) => seen.push(o.key));
    a.storage.setItem('kots', '[]');
    await a.storage.flush();
    await tick();
    expect(seen).toContain('kots');
  });

  it('when the leader window closes, a follower takes over and nothing acknowledged is lost', async () => {
    const browser = new FakeBrowser();
    const a = await openWindow(browser, 'A');
    const b = await openWindow(browser, 'B');
    a.storage.setItem('orders', JSON.stringify([{ id: 'before-close' }]));
    await a.storage.flush();
    await tick();

    a.storage.close();
    browser.releaseLeader();
    await tick(60);
    expect(b.cluster.isLeader).toBe(true);

    b.storage.setItem('orders', JSON.stringify([{ id: 'before-close' }, { id: 'after-takeover' }]));
    await b.storage.flush();
    b.storage.close();

    const fresh = await openWindow(new FakeBrowser(), 'Z');
    expect(JSON.parse(fresh.storage.getItem('orders')!).map((o: { id: string }) => o.id)).toEqual(['before-close', 'after-takeover']);
  });

  it('a write made while no leader can answer is kept, reported, and lands once a leader exists', async () => {
    const browser = new FakeBrowser();
    const a = await openWindow(browser, 'A');
    const b = await openWindow(browser, 'B', { requestTimeoutMs: 60 });

    a.storage.close(); // leader gone, lock not released yet: nobody to acknowledge
    b.storage.setItem('pending', 'x');
    await b.storage.flush().catch(() => undefined);
    expect(b.storage.health().ok).toBe(false);
    expect(b.storage.getItem('pending')).toBe('x');

    browser.releaseLeader(); // b is promoted and its retry succeeds
    await tick(150);
    expect(b.cluster.isLeader).toBe(true);
    expect(b.storage.health().ok).toBe(true);
    b.storage.close();
    const fresh = await openWindow(new FakeBrowser(), 'Z');
    expect(fresh.storage.getItem('pending')).toBe('x');
  });
});
