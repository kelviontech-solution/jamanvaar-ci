import type { StoreOp, DurableCommand, DurableCommandResult, DurableRecoverySnapshot } from './sql_kv_engine';
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
  private acks = new Map<number, { resolve: (value: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private snapshotWaiter: ((data: Record<string, string>) => void) | null = null;
  private closed = false;
  private releaseLeadership: (() => void) | null = null;

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
        return new Promise<void>((release) => { this.releaseLeadership = release; });
      }).catch(() => resolve(false));
    });

    if (acquired) {
      this.leader = this.opts.makeLeaderBackend();
      this.isLeader = true;
      return this.leader.load();
    }

    // Follower: queue for leadership in the background and ask the current leader for its data.
    void this.opts.locks.request(`jamanvaar-db-${this.opts.name}`, (lock) => {
      if (this.closed) return undefined;
      if (!lock) return undefined;
      void this.promote().catch(() => { this.releaseLeadership?.(); });
      return new Promise<void>((release) => { this.releaseLeadership = release; });
    }).catch(() => undefined);
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
    try { await backend.load(); }
    catch (error) { backend.close(); throw error; }
    if (this.closed) { backend.close(); return; }
    this.leader = backend;
    this.isLeader = true;
  }

  async write(ops: StoreOp[]): Promise<void> {
    if (this.isLeader && this.leader) {
      await this.leader.write(ops);
      this.channel.postMessage({ t: 'ops', from: this.opts.windowId, ops });
      return;
    }
    await this.request<void>({ t: 'write', ops });
  }

  async command(command: DurableCommand): Promise<DurableCommandResult> {
    if (this.isLeader && this.leader) {
      if (!this.leader.command) throw new Error('Local leader does not support durable operation replay');
      const result = await this.leader.command(command);
      this.channel.postMessage({ t: 'ops', from: this.opts.windowId, ops: this.commandOps(result) });
      return result;
    }
    return this.request<DurableCommandResult>({ t: 'command', command });
  }

  private commandOps(result: Pick<DurableCommandResult, 'values'>): StoreOp[] {
    return Object.entries(result.values).map(([key, value]) => value === null ? { op: 'remove', key } : { op: 'set', key, value });
  }

  async exportRecovery(scope: string): Promise<DurableRecoverySnapshot> {
    if (this.isLeader && this.leader) {
      if (!this.leader.exportRecovery) throw new Error('Local leader does not support complete recovery');
      return this.leader.exportRecovery(scope);
    }
    return this.request<DurableRecoverySnapshot>({ t: 'recovery-export', scope });
  }

  async restoreRecovery(snapshot: DurableRecoverySnapshot, expectedScope: string): Promise<void> {
    if (this.isLeader && this.leader) {
      if (!this.leader.restoreRecovery) throw new Error('Local leader does not support complete recovery');
      await this.leader.restoreRecovery(snapshot, expectedScope);
      this.channel.postMessage({ t: 'ops', from: this.opts.windowId, ops: this.commandOps({ values: snapshot.values }) });
      return;
    }
    await this.request<void>({ t: 'recovery-restore', snapshot, expectedScope });
  }

  private async request<T>(message: Record<string, unknown>): Promise<T> {
    if (this.closed) throw new Error('Local database closed');
    const id = this.nextReq++;
    const timeoutMs = this.opts.requestTimeoutMs ?? 3000;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.acks.delete(id);
        reject(new Error('The window that owns the local database did not respond'));
      }, timeoutMs);
      this.acks.set(id, { resolve: value => resolve(value as T), reject, timer });
      try { this.channel.postMessage({ ...message, from: this.opts.windowId, id }); }
      catch (error) { clearTimeout(timer); this.acks.delete(id); reject(error); }
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
            this.channel.postMessage({ t: 'nack', to: m.from, id: m.id, error: (err as Error).message, code: (err as { code?: string }).code });
          }
        }
        break;
      case 'command':
        if (this.isLeader && this.leader) {
          try {
            if (!this.leader.command) throw new Error('Local leader does not support durable operation replay');
            const result = await this.leader.command(m.command as DurableCommand);
            const ops = this.commandOps(result);
            this.hooks?.remote(ops);
            this.channel.postMessage({ t: 'ops', from: m.from, ops });
            this.channel.postMessage({ t: 'ack', to: m.from, id: m.id, result });
          } catch (err) {
            this.channel.postMessage({ t: 'nack', to: m.from, id: m.id, error: (err as Error).message, code: (err as { code?: string }).code });
          }
        }
        break;
      case 'recovery-export':
      case 'recovery-restore':
        if (this.isLeader && this.leader) {
          try {
            let result: DurableRecoverySnapshot | undefined;
            if (m.t === 'recovery-export') {
              if (!this.leader.exportRecovery) throw new Error('Local leader does not support complete recovery');
              result = await this.leader.exportRecovery(m.scope);
            } else {
              if (!this.leader.restoreRecovery) throw new Error('Local leader does not support complete recovery');
              await this.leader.restoreRecovery(m.snapshot, m.expectedScope);
              const ops = this.commandOps({ values: m.snapshot.values });
              this.hooks?.remote(ops);
              this.channel.postMessage({ t: 'ops', from: m.from, ops });
            }
            this.channel.postMessage({ t: 'ack', to: m.from, id: m.id, result });
          } catch (err) { this.channel.postMessage({ t: 'nack', to: m.from, id: m.id, error: (err as Error).message }); }
        }
        break;
      case 'ack':
      case 'nack': {
        if (m.to !== this.opts.windowId) break;
        const w = this.acks.get(m.id);
        if (!w) break;
        this.acks.delete(m.id);
        clearTimeout(w.timer);
        if (m.t === 'ack') w.resolve(m.result);
        else w.reject(Object.assign(new Error(m.error ?? 'write refused'), { code: m.code }));
        break;
      }
    }
  }

  close(): void {
    this.closed = true;
    this.releaseLeadership?.();
    this.releaseLeadership = null;
    this.snapshotWaiter?.({});
    this.acks.forEach((w) => { clearTimeout(w.timer); w.reject(new Error('Local database closed')); });
    this.acks.clear();
    this.channel.close();
    this.leader?.close();
    this.leader = null;
    this.isLeader = false;
  }
}
