import { DatabaseSync } from 'node:sqlite';

/**
 * The Branch Core's durable database: SQLite, transactional, versioned. Nothing here is a cache that can
 * be lost: orders, KOT-bearing order state, inventory movements, device roster, pending cloud uploads and
 * the local sequence all live in this file.
 */

/** Migrations run in order, each in its own transaction; PRAGMA user_version records how far we got. */
const MIGRATIONS: string[][] = [
  // v1
  [
    `CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    `CREATE TABLE devices (
       id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT, branch_id TEXT, status TEXT NOT NULL,
       is_locked INTEGER NOT NULL DEFAULT 0, lock_reason TEXT, token_hash TEXT UNIQUE,
       app_enabled INTEGER NOT NULL DEFAULT 1, last_seen_at INTEGER, pending INTEGER NOT NULL DEFAULT 0,
       sync_error TEXT, app_version TEXT, menu_version INTEGER, updated_at INTEGER NOT NULL)`,
    `CREATE TABLE orders (
       external_order_id TEXT PRIMARY KEY, order_type TEXT NOT NULL, status TEXT NOT NULL, table_id TEXT, table_label TEXT,
       items TEXT NOT NULL, subtotal INTEGER NOT NULL, tax_amount INTEGER NOT NULL, discount_amount INTEGER NOT NULL DEFAULT 0,
       total_amount INTEGER NOT NULL, notes TEXT, payment_status TEXT, payment_method TEXT, meta TEXT, device_id TEXT,
       sync_version INTEGER NOT NULL DEFAULT 1, seq INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
    `CREATE INDEX orders_by_seq ON orders (seq)`,
    `CREATE TABLE processed_events (event_id TEXT PRIMARY KEY, result TEXT NOT NULL, created_at INTEGER NOT NULL)`,
    `CREATE TABLE seq_counter (name TEXT PRIMARY KEY, value INTEGER NOT NULL)`,
    `CREATE TABLE movements (
       movement_id TEXT PRIMARY KEY, device_id TEXT, item_id TEXT NOT NULL, item_name TEXT NOT NULL, type TEXT NOT NULL,
       quantity_delta REAL NOT NULL, unit TEXT NOT NULL, order_id TEXT, reason TEXT NOT NULL, occurred_at TEXT NOT NULL, seq INTEGER NOT NULL)`,
    `CREATE INDEX movements_by_seq ON movements (seq)`,
    `CREATE TABLE number_seq (kind TEXT NOT NULL, business_date TEXT NOT NULL, next INTEGER NOT NULL, PRIMARY KEY (kind, business_date))`,
    `CREATE TABLE entities (
       entity_type TEXT NOT NULL, external_id TEXT NOT NULL, payload TEXT NOT NULL, sync_version INTEGER NOT NULL DEFAULT 1,
       updated_at INTEGER NOT NULL, dirty INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (entity_type, external_id))`,
    `CREATE TABLE conflicts (
       id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, reason TEXT NOT NULL,
       local_version TEXT, cloud_version TEXT, device_id TEXT, created_at INTEGER NOT NULL, resolved INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE cloud_outbox (
       id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, dedupe_key TEXT NOT NULL UNIQUE, payload TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'PENDING', attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0,
       last_error TEXT, created_at INTEGER NOT NULL)`,
    `CREATE INDEX outbox_by_status ON cloud_outbox (status, next_attempt_at, id)`,
    `CREATE TABLE commands (
       id TEXT PRIMARY KEY, device_id TEXT NOT NULL, type TEXT NOT NULL, payload TEXT, status TEXT NOT NULL DEFAULT 'PENDING',
       retry_count INTEGER NOT NULL DEFAULT 0, sent_at INTEGER, idempotency_key TEXT, issued_by TEXT, result TEXT, error TEXT,
       created_at INTEGER NOT NULL, UNIQUE (device_id, idempotency_key))`,
    `CREATE TABLE sync_log (
       id INTEGER PRIMARY KEY AUTOINCREMENT, trace_id TEXT, event_id TEXT, entity_id TEXT, status TEXT NOT NULL, error TEXT,
       device_id TEXT, at INTEGER NOT NULL)`
  ],
  [
    `ALTER TABLE entities ADD COLUMN seq INTEGER NOT NULL DEFAULT 0`,
    `UPDATE entities SET seq = rowid`,
    `INSERT INTO seq_counter (name, value) SELECT 'entities', COALESCE(MAX(seq), 0) FROM entities`,
    `CREATE INDEX entities_by_seq ON entities (entity_type, seq)`
  ]
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export class BranchStore {
  readonly db: DatabaseSync;
  private depth = 0;

  constructor(path: string = ':memory:') {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = FULL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.migrate();
  }

  /** Schema version this file is at (also reported to the cloud for support). */
  get schemaVersion(): number {
    return Number(this.db.prepare('PRAGMA user_version').get()!.user_version);
  }

  private migrate(): void {
    let v = this.schemaVersion;
    if (v > MIGRATIONS.length) {
      throw new Error(`Database is version ${v}, newer than this Branch Core understands (${MIGRATIONS.length}). Update the application.`);
    }
    for (; v < MIGRATIONS.length; v++) {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        for (const sql of MIGRATIONS[v]) this.db.exec(sql);
        this.db.exec(`PRAGMA user_version = ${v + 1}`);
        this.db.exec('COMMIT');
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
    }
  }

  /** Runs `fn` atomically; nested calls join the outer transaction. */
  transaction<T>(fn: () => T): T {
    if (this.depth > 0) return fn();
    this.db.exec('BEGIN IMMEDIATE');
    this.depth++;
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    } finally {
      this.depth--;
    }
  }

  /** A failing step inside a transaction is undone without abandoning the rest of the batch. */
  attempt<T>(fn: () => T): { ok: true; value: T } | { ok: false; error: Error } {
    this.db.exec('SAVEPOINT attempt');
    try {
      const value = fn();
      this.db.exec('RELEASE attempt');
      return { ok: true, value };
    } catch (err) {
      this.db.exec('ROLLBACK TO attempt');
      this.db.exec('RELEASE attempt');
      return { ok: false, error: err as Error };
    }
  }

  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
    return this.db.prepare(sql).get(...(params as never[])) as T | undefined;
  }

  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
    return this.db.prepare(sql).all(...(params as never[])) as T[];
  }

  run(sql: string, ...params: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
    const r = this.db.prepare(sql).run(...(params as never[]));
    return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid };
  }

  getConfig(key: string): string | null {
    return this.get<{ value: string }>('SELECT value FROM config WHERE key = ?', key)?.value ?? null;
  }

  setConfig(key: string, value: string): void {
    this.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', key, value);
  }

  /** Next value of a named counter. Must run inside a transaction. */
  nextSeq(name = 'changes'): number {
    this.run('INSERT INTO seq_counter (name, value) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1', name);
    return Number(this.get<{ value: number }>('SELECT value FROM seq_counter WHERE name = ?', name)!.value);
  }

  currentSeq(name = 'changes'): number {
    return Number(this.get<{ value: number }>('SELECT value FROM seq_counter WHERE name = ?', name)?.value ?? 0);
  }

  close(): void {
    this.db.close();
  }
}
