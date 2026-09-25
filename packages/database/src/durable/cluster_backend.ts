import type { StoreOp } from './sql_kv_engine';
import type { StorageBackend, StorageHooks } from './durable_storage';

/**
 * Several windows of the same app share one database (POS, Restaurant Admin, Kiosk... run in separate
 * windows on one machine). Only one window can own the SQLite file, so one is elected leader through the
 * browser's Web Locks: it runs the SQLite worker, persists every window's writes in order, and tells the
 * others what changed. Followers keep a full in-memory copy and send their writes to the leader. If the
 * leader window closes, the lock passes to a follower, which opens the database and carries on; writes that
 * were never acknowledged are simply retried against the new leader.
 */

export interface Locks {
  request(name: string, opts: { ifAvailable?: boolean }, cb: (lock: object | null) => unknown): Promise<unknown>;
  request(name: string, cb: (lock: object | null) => unknown): Promise<unknown>;
}

export interface Channel {
  postMessage(m: unknown): void;
  onmessage: ((e: { data: any }) => void) | null;
  close(): void;
}

export interface ClusterOptions {
  name: string;
  windowId: string;
  locks: Locks;
  makeChannel: () => Channel;
  makeLeaderBackend: () => StorageBackend;
  /** How long a follower waits for the leader to acknowledge a write. */
  requestTimeoutMs?: number;
  /** How long a follower waits for the leader's snapshot at startup. */
  snapshotTimeoutMs?: number;
}

export class ClusterBackend implements StorageBackend {
  isLeader = false;
  private leader: StorageBackend | null = null;
  private channel: Channel;
  private hooks: StorageHooks | null = null;
  private nextReq = 1;
  private acks = new Map<number, { resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private snapshotWaiter: ((data: Record<string, string>) => void) | null = null;
  private closed = false;

  constructor(private readonly opts: ClusterOptions) {
    this.channel = opts.makeChannel();
    this.channel.onmessage = (e) => void this.onMessage(e.data);
  }

  attach(hooks: StorageHooks): void {
    this.hooks = hooks;
  }

  async load(): Promise<Record<string, string>> {
    const acquired = await new Promise<boolean>((resolve) => {
      void this.opts.locks.request(`jamanvaar-db-${this.opts.name}`, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(false);
          return undefined;
        }
        resolve(true);
        return new Promise(() => undefined); // hold leadership until this window goes away
      });
    });

    if (acquired) {
      this.leader = this.opts.makeLeaderBackend();
      this.isLeader = true;
      return this.leader.load();
    }

    // Follower: queue for leadership in the background and ask the current leader for its data.
    void this.opts.locks.request(`jamanvaar-db-${this.opts.name}`, (lock) => {
      if (this.closed) return undefined;
      void this.promote();
      return lock ? new Promise(() => undefined) : undefined;
    });
    return this.requestSnapshot();
  }

  private async requestSnapshot(): Promise<Record<string, string>> {
    const timeout = this.opts.snapshotTimeoutMs ?? 2000;
    for (let attempt = 0; attempt < 5; attempt++) {
      const data = await new Promise<Record<string, string> | null>((resolve) => {
        const timer = setTimeout(() => {
          this.snapshotWaiter = null;
          resolve(null);
        }, timeout);
        this.snapshotWaiter = (d) => {
          clearTimeout(timer);
          this.snapshotWaiter = null;
          resolve(d);
        };
        this.channel.postMessage({ t: 'snapshot-req', from: this.opts.windowId });
      });
      if (data) return data;
      if (this.isLeader) return this.hooks?.snapshot() ?? {};
    }
    throw new Error('Could not reach the window that owns the local database');
  }

  /** This window has been handed leadership: open the database and start persisting for everyone. */
  private async promote(): Promise<void> {
    if (this.isLeader || this.closed) return;
    const backend = this.opts.makeLeaderBackend();
    await backend.load(); // opens the file; our in-memory copy is already current (every applied change was persisted first)
    this.leader = backend;
    this.isLeader = true;
  }

  async write(ops: StoreOp[]): Promise<void> {
    if (this.isLeader && this.leader) {
      await this.leader.write(ops);
      this.channel.postMessage({ t: 'ops', from: this.opts.windowId, ops });
      return;
    }
    const id = this.nextReq++;
    const timeoutMs = this.opts.requestTimeoutMs ?? 3000;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.acks.delete(id);
        reject(new Error('The window that owns the local database did not respond'));
      }, timeoutMs);
      this.acks.set(id, { resolve, reject, timer });
      this.channel.postMessage({ t: 'write', from: this.opts.windowId, id, ops });
    });
  }

  private async onMessage(m: any): Promise<void> {
    if (!m || m.from === this.opts.windowId) return;
    switch (m.t) {
      case 'snapshot-req':
        if (this.isLeader && this.hooks) this.channel.postMessage({ t: 'snapshot', to: m.from, data: this.hooks.snapshot() });
        break;
      case 'snapshot':
        if (m.to === this.opts.windowId) this.snapshotWaiter?.(m.data);
        break;
      case 'ops':
        this.hooks?.remote(m.ops as StoreOp[]);
        break;
      case 'write':
        if (this.isLeader && this.leader) {
          try {
            await this.leader.write(m.ops);
            this.hooks?.remote(m.ops as StoreOp[]);
            this.channel.postMessage({ t: 'ops', from: m.from, ops: m.ops }); // everyone, including other followers
            this.channel.postMessage({ t: 'ack', to: m.from, id: m.id });
          } catch (err) {
            this.channel.postMessage({ t: 'nack', to: m.from, id: m.id, error: (err as Error).message });
          }
        }
        break;
      case 'ack':
      case 'nack': {
        if (m.to !== this.opts.windowId) break;
        const w = this.acks.get(m.id);
        if (!w) break;
        this.acks.delete(m.id);
        clearTimeout(w.timer);
        if (m.t === 'ack') w.resolve();
        else w.reject(new Error(m.error ?? 'write refused'));
        break;
      }
    }
  }

  close(): void {
    this.closed = true;
    this.acks.forEach((w) => clearTimeout(w.timer));
    this.acks.clear();
    this.channel.close();
    this.leader?.close();
    this.leader = null;
    this.isLeader = false;
  }
}
