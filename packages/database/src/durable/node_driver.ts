import { DatabaseSync } from 'node:sqlite';
import type { SqlDriver } from './sql_kv_engine';

/** SQLite through Node's built-in driver: used by the tests, and by any Node/native host that wants the same store. */
export class NodeSqliteDriver implements SqlDriver {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = FULL');
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  run(sql: string, params: unknown[] = []): void {
    this.db.prepare(sql).run(...(params as never[]));
  }

  all(sql: string, params: unknown[] = []): Array<Record<string, unknown>> {
    return this.db.prepare(sql).all(...(params as never[])) as Array<Record<string, unknown>>;
  }

  close(): void {
    this.db.close();
  }
}
