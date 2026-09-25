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

interface RowInfo {
  json: string;
  ord: number;
}

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS colls (key TEXT PRIMARY KEY) WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS rows (coll TEXT NOT NULL, id TEXT NOT NULL, ord REAL NOT NULL, json TEXT NOT NULL, PRIMARY KEY (coll, id)) WITHOUT ROWID',
  'CREATE INDEX IF NOT EXISTS rows_by_ord ON rows (coll, ord)'
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
    for (const coll of this.collections) {
      const list = this.driver.all('SELECT json FROM rows WHERE coll = ? ORDER BY ord', [coll]);
      out[coll] = '[' + list.map((r) => String(r.json)).join(',') + ']';
    }
    return out;
  }

  applyBatch(ops: StoreOp[]): void {
    this.lastRowWrites = 0;
    // Work on copies of the in-memory indexes so a rolled-back batch leaves them untouched.
    const rowIndex = new Map<string, Map<string, RowInfo>>();
    const collections = new Set(this.collections);
    const indexFor = (coll: string) => {
      if (!rowIndex.has(coll)) rowIndex.set(coll, new Map(this.rowIndex.get(coll) ?? []));
      return rowIndex.get(coll)!;
    };

    this.driver.exec('BEGIN IMMEDIATE');
    try {
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
