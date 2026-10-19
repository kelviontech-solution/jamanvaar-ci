import { SqlKvEngine, isDurableCommandRejection, type StoreOp, type DurableCommand, type DurableCommandResult, type DurableRecoverySnapshot } from './sql_kv_engine';

export class DurableCommandFailure extends Error {
  override name = 'DurableCommandFailure';
  readonly outcome: 'REJECTED' | 'RECOVERY_REQUIRED';
  readonly code?: string;
  constructor(error: unknown) {
    super(error instanceof Error ? error.message : String(error), { cause: error });
    this.outcome = isDurableCommandRejection(error) ? 'REJECTED' : 'RECOVERY_REQUIRED';
    const code = (error as { code?: unknown })?.code;
    if (typeof code === 'string') this.code = code;
  }
}

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
  command?(command: DurableCommand): Promise<DurableCommandResult>;
  exportRecovery?(scope: string): Promise<DurableRecoverySnapshot>;
  restoreRecovery?(snapshot: DurableRecoverySnapshot, expectedScope: string): Promise<void>;
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

  async command(command: DurableCommand): Promise<DurableCommandResult> {
    if (this.failNext > 0) { this.failNext--; throw new Error('simulated write failure'); }
    return this.engine.applyCommand(command);
  }

  async exportRecovery(scope: string): Promise<DurableRecoverySnapshot> { return this.engine.exportRecovery(scope); }
  async restoreRecovery(snapshot: DurableRecoverySnapshot, expectedScope: string): Promise<void> { this.engine.restoreRecovery(snapshot, expectedScope); }

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
  private inFlight = 0;
  private localRevision = new Map<string, number>();
  private recovering = false;

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
  private readonly remoteListeners = new Set<(ops: StoreOp[]) => void>();

  subscribeRemote(listener: (ops: StoreOp[]) => void): () => void {
    this.remoteListeners.add(listener);
    return () => this.remoteListeners.delete(listener);
  }

  private applyRemote(ops: StoreOp[]): void {
    const applied: StoreOp[] = [];
    for (const op of ops) {
      if (this.pending.has(op.key)) continue; // this window has a newer local change for the key
      if (op.op === 'set') this.cache.set(op.key, op.value);
      else this.cache.delete(op.key);
      applied.push(op);
    }
    if (applied.length > 0) this.onRemoteChange?.(applied);
    if (applied.length > 0) this.remoteListeners.forEach((listener) => listener(applied));
  }

  getItem(key: string): string | null {
    return this.cache.has(key) ? this.cache.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    if (this.recovering) throw new Error('Recovery is in progress');
    if (this.closed) throw new Error('Durable storage is closed');
    this.localRevision.set(key, (this.localRevision.get(key) ?? 0) + 1);
    const text = String(value);
    this.cache.set(key, text);
    this.enqueue({ op: 'set', key, value: text });
  }

  removeItem(key: string): void {
    if (this.recovering) throw new Error('Recovery is in progress');
    if (this.closed) throw new Error('Durable storage is closed');
    this.localRevision.set(key, (this.localRevision.get(key) ?? 0) + 1);
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

  health(): { ok: boolean; error: string | null; commitState: 'CLOSED' | 'FAILED' | 'PENDING' | 'COMMITTED'; pendingWrites: number } {
    return { ok: !this.closed && this.error === null, error: this.error,
      commitState: this.closed ? 'CLOSED' : this.error ? 'FAILED' : this.pending.size || this.inFlight ? 'PENDING' : 'COMMITTED',
      pendingWrites: this.pending.size + this.inFlight };
  }

  /**
   * An explicit atomic batch, acknowledged only after the backend transaction commits. Unlike
   * setItem, this does not publish its values to synchronous readers before acknowledgement.
   * Callers still need a persistent business operation ID and must defer external side effects;
   * this storage primitive alone is not an idempotent financial command engine.
   */
  async commitBatch(ops: StoreOp[]): Promise<void> {
    await this.commitPrepared(ops);
  }

  async exportRecovery(scope: string): Promise<DurableRecoverySnapshot> {
    if (!this.backend.exportRecovery) throw new Error('This backend does not support complete local recovery');
    await this.flush();
    return this.backend.exportRecovery(scope);
  }

  async restoreRecovery(snapshot: DurableRecoverySnapshot, expectedScope: string): Promise<void> {
    if (this.closed || this.recovering || this.cache.size || this.pending.size || this.inFlight) throw new Error('Recovery requires an open, empty and idle target');
    if (!this.backend.restoreRecovery) throw new Error('This backend does not support complete local recovery');
    this.recovering = true;
    this.inFlight++;
    try {
      const frozen = structuredClone(snapshot);
      await this.backend.restoreRecovery(frozen, expectedScope);
      if (this.closed) throw new Error('Storage closed during recovery; reopen and verify before retrying');
      for (const [key, value] of Object.entries(frozen.values)) this.cache.set(key, value);
      this.error = null;
    } catch (error) { this.error = error instanceof Error ? error.message : String(error); throw error; }
    finally { this.recovering = false; this.inFlight--; }
  }

  /** No fallback to ordinary writes: a backend must implement transactional operation replay. */
  async commitCommand(command: DurableCommand): Promise<DurableCommandResult> {
    if (!this.backend.command) throw new Error('This storage backend does not support durable operation replay');
    const frozen = structuredClone(command);
    let outcome!: DurableCommandResult;
    try {
      await this.commitPrepared(frozen.ops, async () => {
        outcome = await this.backend.command!(frozen);
        return Object.entries(outcome.values).map(([key, value]): StoreOp => value === null ? { op: 'remove', key } : { op: 'set', key, value });
      }, frozen.expected.map(entry => entry.key));
    } catch (error) { throw new DurableCommandFailure(error); }
    return outcome;
  }

  private async commitPrepared(ops: StoreOp[], command?: () => Promise<StoreOp[]>, observedKeys: string[] = []): Promise<void> {
    if (this.recovering) throw new Error('Recovery is in progress');
    if (this.closed) throw new Error('Durable storage is closed');
    const batch = ops.map(op => ({ ...op }));
    const revisions = new Map([...batch.map(op => op.key), ...observedKeys].map(key => [key, this.localRevision.get(key) ?? 0]));
    // Establish the boundary now, before yielding. Draining the live pending map
    // inside the queued task would put a later same-tick edit BEFORE this batch,
    // then overwrite that newer value on disk while the cache still showed it.
    const preceding = [...this.pending.values()];
    this.pending = new Map();
    this.scheduled = false;
    this.inFlight++;
    const committed = this.writing.then(async () => {
      if (this.closed) throw new Error('Durable storage is closed');
      if (this.error && this.pending.size) {
        for (const op of preceding) if (!this.pending.has(op.key)) this.pending.set(op.key, op);
        throw new Error(this.error);
      }
      if (preceding.length) await this.writePendingBatch(preceding);
      if (this.error && this.pending.size) throw new Error(this.error);
      const applied = command ? await command() : (await this.backend.write(batch), batch);
      if (this.closed) throw new Error('Storage closed before commit acknowledgement; recover before retrying');
      for (const op of applied) {
        // Do not overwrite a later ordinary write which is still queued behind this transaction.
        if ((this.localRevision.get(op.key) ?? 0) !== revisions.get(op.key)) continue;
        if (op.op === 'set') this.cache.set(op.key, op.value);
        else this.cache.delete(op.key);
      }
      this.error = null;
    });
    this.writing = committed.catch(() => undefined);
    try { await committed; }
    catch (error) { if (!isDurableCommandRejection(error)) this.error = error instanceof Error ? error.message : String(error); throw error; }
    finally { this.inFlight--; }
  }

  /** Resolves once everything written so far is durable in SQLite (rejects if that could not be achieved). */
  async flush(): Promise<void> {
    if (this.closed) throw new Error('Durable storage is closed');
    this.scheduled = false;
    this.writing = this.writing.then(() => this.drain());
    await this.writing;
    if (this.closed) throw new Error('Storage closed before commit acknowledgement; recover before retrying');
    if (this.error) throw new Error(this.error);
  }

  close(): void {
    if (this.closed) return;
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
    await this.writePendingBatch(batch);
  }

  private async writePendingBatch(batch: StoreOp[]): Promise<void> {
    this.inFlight++;
    try {
      await this.backend.write(batch);
      this.error = null;
    } catch (err) {
      // Keep the failed changes (newer changes to the same key win) and try again shortly.
      for (const op of batch) if (!this.pending.has(op.key)) this.pending.set(op.key, op);
      this.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      this.scheduleRetry();
    } finally {
      this.inFlight--;
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
