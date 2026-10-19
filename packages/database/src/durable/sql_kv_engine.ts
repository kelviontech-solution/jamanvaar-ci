/**
 * The SQLite side of the local store. It presents the same key/text shape the app already uses, but
 * persists it durably and atomically:
 *  - every batch of changes is one SQL transaction, so a crash leaves all of it or none of it;
 *  - a value that is a list of records with unique string `id`s is stored one row per record, and only
 *    the rows that changed are rewritten (orders, KOTs, stock movements... grow without rewriting all);
 *  - everything else is a plain key/value row.
 * The SQL runs against a small driver interface so the same engine works in a browser worker (SQLite
 * WASM on OPFS) and in Node (node:sqlite) for tests and any native host.
 */

export interface SqlDriver {
  exec(sql: string): void;
  run(sql: string, params?: unknown[]): void;
  all(sql: string, params?: unknown[]): Array<Record<string, unknown>>;
  close(): void;
}

export type StoreOp = { op: 'set'; key: string; value: string } | { op: 'remove'; key: string };

/** Prepared by the business layer. Every key read or written is checked inside SQLite's write lock. */
export interface DurableCommand {
  operationId: string;
  /** SHA-256 of the original business request, retained across ambiguous-outcome retries. */
  requestFingerprint: string;
  expected: Array<{ key: string; value: string | null }>;
  ops: StoreOp[];
  /** JSON result references, committed alongside the effects; never an external side effect. */
  result: string;
}

export interface DurableCommandResult {
  outcome: 'COMMITTED' | 'REPLAYED';
  result: string;
  /** Current values, not historical replay payloads. A replay must not roll later edits back. */
  values: Record<string, string | null>;
}

/** Internal recovery data: protect this envelope before exporting it outside the device. */
export interface DurableRecoverySnapshot {
  format: 'jamanvaar-local-recovery';
  version: 1;
  scope: string;
  values: Record<string, string>;
  commands: Array<{ operationId: string; requestFingerprint: string; result: string }>;
}

export class DurableCommandRejected extends Error {
  override name = 'DurableCommandRejected';
  constructor(readonly code: 'INVALID_LOCAL_COMMAND' | 'OPERATION_ID_REUSED' | 'LOCAL_VERSION_CONFLICT', message: string) { super(message); }
}

export function isDurableCommandRejection(error: unknown): boolean {
  return ['INVALID_LOCAL_COMMAND', 'OPERATION_ID_REUSED', 'LOCAL_VERSION_CONFLICT'].includes(String((error as { code?: unknown })?.code ?? ''));
}

interface RowInfo {
  json: string;
  ord: number;
}

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS colls (key TEXT PRIMARY KEY) WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS rows (coll TEXT NOT NULL, id TEXT NOT NULL, ord REAL NOT NULL, json TEXT NOT NULL, PRIMARY KEY (coll, id)) WITHOUT ROWID',
  'CREATE INDEX IF NOT EXISTS rows_by_ord ON rows (coll, ord)',
  'CREATE TABLE IF NOT EXISTS local_commands (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result TEXT NOT NULL) WITHOUT ROWID'
];

/** Parses `text` as a list of records with unique string ids, or returns null if it is anything else. */
function asRecordList(text: string): Array<Record<string, unknown>> | null {
  const c = text.charCodeAt(0);
  if (c !== 91 /* [ */) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const seen = new Set<string>();
  for (const r of parsed) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
    const id = (r as { id?: unknown }).id;
    if (typeof id !== 'string' || id === '' || seen.has(id)) return null;
    seen.add(id);
  }
  return parsed as Array<Record<string, unknown>>;
}

export class SqlKvEngine {
  /** Number of record rows written by the most recent batch (used to prove writes stay incremental). */
  lastRowWrites = 0;
  private rowIndex = new Map<string, Map<string, RowInfo>>();
  private collections = new Set<string>();

  constructor(private readonly driver: SqlDriver) {}

  init(): void {
    for (const sql of SCHEMA) this.driver.exec(sql);
    for (const r of this.driver.all('SELECT key FROM colls')) this.collections.add(String(r.key));
    for (const r of this.driver.all('SELECT coll, id, ord, json FROM rows')) {
      const coll = String(r.coll);
      if (!this.rowIndex.has(coll)) this.rowIndex.set(coll, new Map());
      this.rowIndex.get(coll)!.set(String(r.id), { json: String(r.json), ord: Number(r.ord) });
    }
  }

  close(): void {
    this.driver.close();
  }

  /** Everything stored, as key -> text, exactly as the app wrote it. */
  loadAll(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const r of this.driver.all('SELECT key, value FROM kv')) out[String(r.key)] = String(r.value);
    for (const { key } of this.driver.all('SELECT key FROM colls')) {
      const coll = String(key);
      const list = this.driver.all('SELECT json FROM rows WHERE coll = ? ORDER BY ord', [coll]);
      out[coll] = '[' + list.map((r) => String(r.json)).join(',') + ']';
    }
    return out;
  }

  applyBatch(ops: StoreOp[]): void {
    this.writeTransaction(ops);
  }

  exportRecovery(scope: string): DurableRecoverySnapshot {
    if (!scope || scope.length > 256) throw new Error('A recovery scope is required');
    this.driver.exec('BEGIN');
    try {
      const values = this.loadAll();
      const commands = this.driver.all('SELECT id, fingerprint, result FROM local_commands ORDER BY id').map(row => ({ operationId: String(row.id), requestFingerprint: String(row.fingerprint), result: String(row.result) }));
      this.driver.exec('COMMIT');
      return { format: 'jamanvaar-local-recovery', version: 1, scope, values, commands };
    } catch (error) { try { this.driver.exec('ROLLBACK'); } catch { /* already rolled back */ } throw error; }
  }

  /** Restore only to an empty target; applying an old snapshot over live collections is unsafe. */
  restoreRecovery(snapshot: DurableRecoverySnapshot, expectedScope: string): void {
    if (!snapshot || snapshot.format !== 'jamanvaar-local-recovery' || snapshot.version !== 1 || !expectedScope || snapshot.scope !== expectedScope) throw new Error('Recovery format or scope does not match this target');
    if (!snapshot.values || typeof snapshot.values !== 'object' || Array.isArray(snapshot.values) || !Array.isArray(snapshot.commands)) throw new Error('Invalid recovery envelope');
    const ops: StoreOp[] = Object.entries(snapshot.values).map(([key, value]) => {
      if (typeof value !== 'string') throw new Error('Invalid recovery value');
      return { op: 'set', key, value };
    });
    const ids = new Set<string>();
    for (const command of snapshot.commands) {
      if (!command || typeof command.operationId !== 'string' || !command.operationId || command.operationId.length > 256 || ids.has(command.operationId) || !/^[a-f0-9]{64}$/.test(command.requestFingerprint) || typeof command.result !== 'string') throw new Error('Invalid recovery operation ledger');
      JSON.parse(command.result); ids.add(command.operationId);
    }
    this.writeTransaction(ops, () => {
      if (this.driver.all('SELECT key FROM kv LIMIT 1').length || this.driver.all('SELECT key FROM colls LIMIT 1').length || this.driver.all('SELECT id FROM local_commands LIMIT 1').length) throw new Error('Recovery requires an empty target; existing history was preserved');
    }, () => {
      for (const command of snapshot.commands) this.driver.run('INSERT INTO local_commands (id, fingerprint, result) VALUES (?, ?, ?)', [command.operationId, command.requestFingerprint, command.result]);
    });
  }

  /** Duplicate checking, read-set validation, effects and operation result share one transaction. */
  applyCommand(command: DurableCommand): DurableCommandResult {
    if (!command || typeof command.operationId !== 'string' || !command.operationId || command.operationId.length > 256 || typeof command.requestFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(command.requestFingerprint)) throw new DurableCommandRejected('INVALID_LOCAL_COMMAND', 'Invalid local operation identity');
    try { if (typeof command.result !== 'string') throw Error(); JSON.parse(command.result); }
    catch { throw new DurableCommandRejected('INVALID_LOCAL_COMMAND', 'Local operation result must be JSON'); }
    if (!Array.isArray(command.expected) || !Array.isArray(command.ops) || command.expected.some(entry => !entry || typeof entry !== 'object') || command.ops.some(op => !op || typeof op !== 'object' || !['set', 'remove'].includes(op.op))) throw new DurableCommandRejected('INVALID_LOCAL_COMMAND', 'Invalid command read or write set');
    const expected = new Map(command.expected.map(entry => [entry.key, entry.value]));
    if (expected.size !== command.expected.length || command.ops.some(op => !expected.has(op.key))) throw new DurableCommandRejected('INVALID_LOCAL_COMMAND', 'Every command write needs an unambiguous expected value');
    if (command.expected.some(entry => typeof entry.key !== 'string' || (entry.value !== null && typeof entry.value !== 'string'))) throw new DurableCommandRejected('INVALID_LOCAL_COMMAND', 'Invalid command read set');
    const replay = Symbol('replay');
    let result: string = command.result;
    try {
      this.writeTransaction(command.ops, () => {
        const prior = this.driver.all('SELECT fingerprint, result FROM local_commands WHERE id = ?', [command.operationId])[0];
        if (prior) {
          if (prior.fingerprint !== command.requestFingerprint) throw new DurableCommandRejected('OPERATION_ID_REUSED', 'OPERATION_ID_REUSED: This operation ID already belongs to a different request');
          result = String(prior.result);
          throw replay;
        }
        for (const [key, value] of expected) {
          // Record lists are stored normalized by row, so compare their normalized serialization.
          const normalized = value === null ? null : asRecordList(value);
          const wanted = normalized === null ? value : JSON.stringify(normalized);
          if (this.readKey(key) !== wanted) throw new DurableCommandRejected('LOCAL_VERSION_CONFLICT', 'LOCAL_VERSION_CONFLICT: Local data changed. Reload and review before retrying');
        }
      }, () => {
        this.driver.run('INSERT INTO local_commands (id, fingerprint, result) VALUES (?, ?, ?)', [command.operationId, command.requestFingerprint, command.result]);
      });
    } catch (error) {
      if (error !== replay) throw error;
      return { outcome: 'REPLAYED', result, values: Object.fromEntries([...expected.keys()].map(key => [key, this.readKey(key)])) };
    }
    return { outcome: 'COMMITTED', result, values: Object.fromEntries([...expected.keys()].map(key => [key, this.readKey(key)])) };
  }

  private readKey(key: string): string | null {
    const scalar = this.driver.all('SELECT value FROM kv WHERE key = ?', [key])[0];
    if (scalar) return String(scalar.value);
    if (!this.driver.all('SELECT key FROM colls WHERE key = ?', [key]).length) return null;
    return '[' + this.driver.all('SELECT json FROM rows WHERE coll = ? ORDER BY ord', [key]).map(row => String(row.json)).join(',') + ']';
  }

  private writeTransaction(ops: StoreOp[], before?: () => void, after?: () => void): void {
    this.lastRowWrites = 0;
    // Work on copies of the in-memory indexes so a rolled-back batch leaves them untouched.
    const rowIndex = new Map<string, Map<string, RowInfo>>();
    const collections = new Set(this.collections);
    const indexFor = (coll: string) => {
      if (!rowIndex.has(coll)) rowIndex.set(coll, before
        ? new Map(this.driver.all('SELECT id, ord, json FROM rows WHERE coll = ?', [coll]).map(row => [String(row.id), { json: String(row.json), ord: Number(row.ord) }]))
        : new Map(this.rowIndex.get(coll) ?? []));
      return rowIndex.get(coll)!;
    };

    this.driver.exec('BEGIN IMMEDIATE');
    try {
      before?.();
      if (before) {
        collections.clear();
        for (const row of this.driver.all('SELECT key FROM colls')) collections.add(String(row.key));
      }
      let rowWrites = 0;
      for (const op of ops) {
        if (op.op === 'remove') {
          this.driver.run('DELETE FROM kv WHERE key = ?', [op.key]);
          if (collections.has(op.key)) {
            this.driver.run('DELETE FROM rows WHERE coll = ?', [op.key]);
            this.driver.run('DELETE FROM colls WHERE key = ?', [op.key]);
            collections.delete(op.key);
            rowIndex.set(op.key, new Map());
          }
          continue;
        }
        if (typeof op.value !== 'string') throw new Error(`Value for "${op.key}" must be a string`);
        const list = asRecordList(op.value);
        if (list === null) {
          if (collections.has(op.key)) {
            this.driver.run('DELETE FROM rows WHERE coll = ?', [op.key]);
            this.driver.run('DELETE FROM colls WHERE key = ?', [op.key]);
            collections.delete(op.key);
            rowIndex.set(op.key, new Map());
          }
          this.driver.run('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [op.key, op.value]);
        } else {
          this.driver.run('DELETE FROM kv WHERE key = ?', [op.key]);
          if (!collections.has(op.key)) {
            this.driver.run('INSERT OR IGNORE INTO colls (key) VALUES (?)', [op.key]);
            collections.add(op.key);
          }
          rowWrites += this.writeRows(op.key, list, indexFor(op.key));
        }
      }
      after?.();
      this.driver.exec('COMMIT');
      this.rowIndex = new Map([...this.rowIndex, ...rowIndex]);
      this.collections = collections;
      this.lastRowWrites = rowWrites;
    } catch (err) {
      try {
        this.driver.exec('ROLLBACK');
      } catch {
        // already rolled back
      }
      throw err;
    }
  }

  /** Diffs `list` against the stored rows of `coll` and writes only what changed. Returns the number of rows written. */
  private writeRows(coll: string, list: Array<Record<string, unknown>>, index: Map<string, RowInfo>): number {
    const jsons = list.map((r) => JSON.stringify(r));
    const ids = list.map((r) => r.id as string);
    const present = new Set(ids);
    let writes = 0;

    for (const id of [...index.keys()]) {
      if (!present.has(id)) {
        this.driver.run('DELETE FROM rows WHERE coll = ? AND id = ?', [coll, id]);
        index.delete(id);
        writes++;
      }
    }

    const ords = this.assignOrders(ids, index);
    for (let i = 0; i < ids.length; i++) {
      const prev = index.get(ids[i]);
      if (prev && prev.json === jsons[i] && prev.ord === ords[i]) continue;
      this.driver.run('INSERT OR REPLACE INTO rows (coll, id, ord, json) VALUES (?, ?, ?, ?)', [coll, ids[i], ords[i], jsons[i]]);
      index.set(ids[i], { json: jsons[i], ord: ords[i] });
      writes++;
    }
    return writes;
  }

  /**
   * Chooses a sort key for every id in list order. Rows already stored keep theirs when their relative
   * order is unchanged, so inserting at the front, back or middle writes only the new rows; if the order of
   * surviving rows changed, everything is renumbered.
   */
  private assignOrders(ids: string[], index: Map<string, RowInfo>): number[] {
    let last = -Infinity;
    let stable = true;
    for (const id of ids) {
      const info = index.get(id);
      if (!info) continue;
      if (info.ord <= last) {
        stable = false;
        break;
      }
      last = info.ord;
    }
    if (!stable) return ids.map((_, i) => i + 1);

    const ords: number[] = new Array(ids.length);
    let i = 0;
    while (i < ids.length) {
      const info = index.get(ids[i]);
      if (info) {
        ords[i] = info.ord;
        i++;
        continue;
      }
      let j = i;
      while (j < ids.length && !index.get(ids[j])) j++;
      const before = i > 0 ? ords[i - 1] : undefined;
      const after = j < ids.length ? index.get(ids[j])!.ord : undefined;
      const count = j - i;
      for (let k = 0; k < count; k++) {
        if (before !== undefined && after !== undefined) ords[i + k] = before + ((after - before) * (k + 1)) / (count + 1);
        else if (before !== undefined) ords[i + k] = before + (k + 1);
        else if (after !== undefined) ords[i + k] = after - (count - k);
        else ords[i + k] = k + 1;
      }
      i = j;
    }
    return ords;
  }
}
