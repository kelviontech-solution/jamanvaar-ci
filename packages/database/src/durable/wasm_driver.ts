import type { SqlDriver } from './sql_kv_engine';

/** The slice of an sqlite-wasm database object the engine needs (kept structural so this file has no import of the WASM package). */
export interface WasmDb {
  exec(arg: string | { sql: string; bind?: unknown[]; rowMode?: 'object'; returnValue?: 'resultRows' }): unknown;
  close(): void;
}

/** SQLite WASM (running on OPFS inside a dedicated worker) as a SqlDriver for SqlKvEngine. */
export class WasmDriver implements SqlDriver {
  constructor(private readonly db: WasmDb) {
    this.db.exec('PRAGMA synchronous = FULL');
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  run(sql: string, params: unknown[] = []): void {
    this.db.exec({ sql, bind: params });
  }

  all(sql: string, params: unknown[] = []): Array<Record<string, unknown>> {
    return this.db.exec({ sql, bind: params, rowMode: 'object', returnValue: 'resultRows' }) as Array<Record<string, unknown>>;
  }

  close(): void {
    this.db.close();
  }
}
