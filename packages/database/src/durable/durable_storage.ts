import { SqlKvEngine, type StoreOp } from './sql_kv_engine';

/**
 * A localStorage-shaped store that the app can read synchronously and that is durable in SQLite.
 *
 * Reads come from an in-memory copy loaded at startup, so the app's synchronous repositories keep working
 * unchanged. Writes update that copy at once and are then written to SQLite in the background: everything
 * changed in the same tick goes in ONE transaction (so the multi-collection saves the app makes are
 * all-or-nothing), batches are written strictly in order, and a failed batch is kept and retried rather
 * than dropped, with the failure reported through health().
 */

/** What a clustered backend needs from the storage that owns it. */
export interface StorageHooks {
  /** The current full contents, for a window that is starting up. */
  snapshot(): Record<string, string>;
  /** Changes made by another window, already persisted, to be applied to this window's copy. */
  remote(ops: StoreOp[]): void;
}

export interface StorageBackend {
  attach?(hooks: StorageHooks): void;
  load(): Promise<Record<string, string>>;
  write(ops: StoreOp[]): Promise<void>;
  close(): void;
}

/** Runs the engine in the current thread. The browser uses a worker backend instead (see sqlite_worker). */
export class EngineBackend implements StorageBackend {
  /** Every batch written, in order (inspected by tests). */
  batches: StoreOp[][] = [];
  /** Makes the next N writes fail (tests). */
  failNext = 0;

  constructor(private readonly engine: SqlKvEngine) {
    engine.init();
  }

  async load() {
    return this.engine.loadAll();
  }

  async write(ops: StoreOp[]) {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error('simulated write failure');
    }
    this.engine.applyBatch(ops);
    this.batches.push(ops);
  }

  close() {
    this.engine.close();
  }
}

export interface DurableStorageOptions {
  /** Delay before a failed batch is retried. */
  retryMs?: number;
}

export class DurableStorage {
  /** Writes made in one tick are one SQL transaction. */
  readonly atomicBatches = true;
  private cache = new Map<string, string>();
  private pending = new Map<string, StoreOp>();
  private scheduled = false;
  private writing: Promise<void> = Promise.resolve();
  private error: string | null = null;
  private closed = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(
    private readonly backend: StorageBackend,
    private readonly opts: DurableStorageOptions
  ) {}

  static async open(backend: StorageBackend, opts: DurableStorageOptions = {}): Promise<DurableStorage> {
    const storage = new DurableStorage(backend, opts);
    backend.attach?.({
      snapshot: () => Object.fromEntries(storage.cache),
      remote: (ops) => storage.applyRemote(ops)
    });
    const all = await backend.load();
    for (const [k, v] of Object.entries(all)) storage.cache.set(k, v);
    return storage;
  }

  /** Called with the changes another window made, after they have been applied to this window's copy. */
  onRemoteChange: ((ops: StoreOp[]) => void) | null = null;

  private applyRemote(ops: StoreOp[]): void {
    const applied: StoreOp[] = [];
    for (const op of ops) {
      if (this.pending.has(op.key)) continue; // this window has a newer local change for the key
      if (op.op === 'set') this.cache.set(op.key, op.value);
      else this.cache.delete(op.key);
      applied.push(op);
    }
    if (applied.length > 0) this.onRemoteChange?.(applied);
  }

  getItem(key: string): string | null {
    return this.cache.has(key) ? this.cache.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    const text = String(value);
    this.cache.set(key, text);
    this.enqueue({ op: 'set', key, value: text });
  }

  removeItem(key: string): void {
    this.cache.delete(key);
    this.enqueue({ op: 'remove', key });
  }

  keys(): string[] {
    return [...this.cache.keys()];
  }

  get length(): number {
    return this.cache.size;
  }

  key(index: number): string | null {
    return this.keys()[index] ?? null;
  }

  health(): { ok: boolean; error: string | null } {
    return { ok: this.error === null, error: this.error };
  }

  /** Resolves once everything written so far is durable in SQLite (rejects if that could not be achieved). */
  async flush(): Promise<void> {
    this.scheduled = false;
    this.writing = this.writing.then(() => this.drain());
    await this.writing;
    if (this.error) throw new Error(this.error);
  }

  close(): void {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.backend.close();
  }

  private enqueue(op: StoreOp): void {
    this.pending.set(op.key, op); // a later change to the same key supersedes the earlier one
    if (this.scheduled || this.closed) return;
    this.scheduled = true;
    queueMicrotask(() => {
      if (!this.scheduled) return;
      this.scheduled = false;
      this.writing = this.writing.then(() => this.drain()).catch(() => undefined);
    });
  }

  private async drain(): Promise<void> {
    if (this.pending.size === 0 || this.closed) return;
    const batch = [...this.pending.values()];
    this.pending = new Map();
    try {
      await this.backend.write(batch);
      this.error = null;
    } catch (err) {
      // Keep the failed changes (newer changes to the same key win) and try again shortly.
      for (const op of batch) if (!this.pending.has(op.key)) this.pending.set(op.key, op);
      this.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer || this.closed) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.writing = this.writing.then(() => this.drain()).catch(() => undefined);
    }, this.opts.retryMs ?? 2000);
  }
}

interface LocalStorageLike {
  getItem(key: string): string | null;
  key(index: number): string | null;
  readonly length: number;
}

/**
 * One-time import of an app's existing localStorage data into SQLite. Only keys with the app's prefix are
 * copied, only if SQLite has nothing for that prefix yet, and the originals are left in place as a backup.
 */
export async function migrateFromLocalStorage(
  storage: DurableStorage,
  ls: LocalStorageLike,
  prefix: string
): Promise<{ migrated: number }> {
  const flag = `__migrated:${prefix}`;
  if (storage.getItem(flag) !== null || storage.keys().some((k) => k.startsWith(prefix))) return { migrated: 0 };

  const keys: string[] = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k && k.startsWith(prefix)) keys.push(k);
  }
  for (const k of keys) {
    const v = ls.getItem(k);
    if (v !== null) storage.setItem(k, v);
  }
  storage.setItem(flag, new Date().toISOString());
  await storage.flush();
  return { migrated: keys.length };
}
