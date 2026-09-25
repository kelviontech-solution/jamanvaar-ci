/// <reference lib="webworker" />
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { SqlKvEngine, type StoreOp } from './sql_kv_engine';
import { WasmDriver, type WasmDb } from './wasm_driver';

/**
 * Dedicated worker that owns the app's SQLite database (SQLite WASM on the browser's private file system).
 * OPFS synchronous access only exists in dedicated workers, and only one may hold the database at a time;
 * cluster_backend elects which window's worker that is.
 */

type Request =
  | { id: number; type: 'open'; name: string }
  | { id: number; type: 'write'; ops: StoreOp[] }
  | { id: number; type: 'close' };

let engine: SqlKvEngine | null = null;

async function open(name: string): Promise<Record<string, string>> {
  const init = sqlite3InitModule as unknown as (o: { print(): void; printErr(): void }) => Promise<Awaited<ReturnType<typeof sqlite3InitModule>>>;
  const sqlite3 = await init({ print: () => undefined, printErr: () => undefined });
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name: `jv-${name}`, directory: `.jv-${name}` });
  const db = new pool.OpfsSAHPoolDb(`/${name}.sqlite3`) as unknown as WasmDb;
  engine = new SqlKvEngine(new WasmDriver(db));
  engine.init();
  return engine.loadAll();
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const msg = e.data;
  try {
    if (msg.type === 'open') {
      const data = await open(msg.name);
      (self as unknown as Worker).postMessage({ id: msg.id, ok: true, data });
    } else if (msg.type === 'write') {
      if (!engine) throw new Error('database not open');
      engine.applyBatch(msg.ops);
      (self as unknown as Worker).postMessage({ id: msg.id, ok: true });
    } else if (msg.type === 'close') {
      engine?.close();
      engine = null;
      (self as unknown as Worker).postMessage({ id: msg.id, ok: true });
    }
  } catch (err) {
    const error = err as Error;
    (self as unknown as Worker).postMessage({ id: msg.id, ok: false, error: `${error?.name ?? 'Error'}: ${error?.message ?? String(err)}`, code: error?.name });
  }
};
