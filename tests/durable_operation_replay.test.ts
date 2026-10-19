import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { SqlKvEngine, type DurableCommand, type StoreOp } from '../packages/database/src/durable/sql_kv_engine';
import { NodeSqliteDriver } from '../packages/database/src/durable/node_driver';
import { DurableStorage, EngineBackend, DurableCommandFailure } from '../packages/database/src/durable/durable_storage';
import { WorkerBackend, type WorkerLike } from '../packages/database/src/durable/worker_backend';

let dir: string;
const engines: SqlKvEngine[] = [];
function engine() {
  const value = new SqlKvEngine(new NodeSqliteDriver(join(dir, 'operations.sqlite3')));
  value.init();
  engines.push(value);
  return value;
}
function command(id = 'tenant:branch:terminal:collection-1'): DurableCommand {
  return {
    operationId: id,
    requestFingerprint: createHash('sha256').update('collect original bill once').digest('hex'),
    expected: ['orders', 'collections', 'stock', 'loyalty', 'outbox'].map((key) => ({ key, value: null })),
    ops: ['orders', 'collections', 'stock', 'loyalty', 'outbox'].map((key) => ({
      op: 'set',
      key,
      value: JSON.stringify([{ id: 'one-effect', operationId: id }])
    })),
    result: JSON.stringify({ orderId: 'order-1', collectionId: 'collection-1' })
  };
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jv-operation-replay-'));
});
afterEach(() => {
  for (const value of engines.splice(0)) {
    try {
      value.close();
    } catch {
      /* already closed by the backend */
    }
  }
  rmSync(dir, { recursive: true, force: true });
});

describe('durable local operation result and effects', () => {
  it('commits every effect and the result once, then replays after a real SQLite close/reopen', () => {
    const first = engine();
    const request = command();
    expect(first.applyCommand(request)).toMatchObject({ outcome: 'COMMITTED', result: request.result });
    first.close();
    const reopened = engine();
    const replay = reopened.applyCommand({ ...request, result: JSON.stringify({ orderId: 'incorrect-new-result' }) });
    expect(replay).toMatchObject({ outcome: 'REPLAYED', result: request.result });
    for (const key of request.expected.map((entry) => entry.key)) expect(JSON.parse(reopened.loadAll()[key])).toHaveLength(1);
  });
  it('does not reuse an operation ID for a different business request', () => {
    const store = engine();
    const request = command();
    store.applyCommand(request);
    expect(() => store.applyCommand({ ...request, requestFingerprint: 'b'.repeat(64) })).toThrow('OPERATION_ID_REUSED');
    expect(JSON.parse(store.loadAll().collections)).toHaveLength(1);
  });
  it('validates read dependencies under the write lock, including changes made through another connection', () => {
    const first = engine(),
      second = engine();
    first.applyBatch([{ op: 'set', key: 'stock', value: 'other-terminal-change' }]);
    const request = command();
    expect(() => second.applyCommand(request)).toThrow('LOCAL_VERSION_CONFLICT');
    expect(second.loadAll().orders).toBeUndefined();
    // Failure did not consume the ID: after an explicit review, this exact request may commit.
    request.expected.find((entry) => entry.key === 'stock')!.value = 'other-terminal-change';
    expect(second.applyCommand(request).outcome).toBe('COMMITTED');
  });
  it('rolls back effects and operation identity together if any write fails', () => {
    const store = engine();
    const request = command();
    const invalid = { ...request, ops: [...request.ops, { op: 'set', key: 'outbox', value: 17 } as unknown as StoreOp] };
    expect(() => store.applyCommand(invalid)).toThrow('must be a string');
    expect(store.loadAll()).toEqual({});
    expect(store.applyCommand(request).outcome).toBe('COMMITTED');
  });
  it('returns current state on replay rather than overwriting later legitimate effects', () => {
    const store = engine();
    const request = command();
    store.applyCommand(request);
    store.applyBatch([{ op: 'set', key: 'orders', value: '[{"id":"one-effect","status":"SERVED"}]' }]);
    const replay = store.applyCommand(request);
    expect(replay.outcome).toBe('REPLAYED');
    expect(JSON.parse(replay.values.orders!)[0].status).toBe('SERVED');
    expect(JSON.parse(store.loadAll().orders)[0].status).toBe('SERVED');
  });
  it('compares normalized row collections and refreshes row indexes inside guarded commands', () => {
    const first = engine(),
      second = engine();
    first.applyBatch([{ op: 'set', key: 'orders', value: '[ {"id":"o1", "amount":10} ]' }]);
    const request = command();
    request.expected[0].value = '[ {"id":"o1", "amount":10} ]';
    request.ops[0] = { op: 'set', key: 'orders', value: '[{"id":"o1","amount":20}]' };
    second.applyCommand(request);
    expect(JSON.parse(second.loadAll().orders)).toEqual([{ id: 'o1', amount: 20 }]);
  });
  it('recovers a lost acknowledgement without repeating effects or regressing the cache', async () => {
    const sql = engine();
    let loseAck = true;
    const storage = await DurableStorage.open({
      load: async () => sql.loadAll(),
      write: async (ops) => sql.applyBatch(ops),
      command: async (request) => {
        const result = sql.applyCommand(request);
        if (loseAck) {
          loseAck = false;
          throw Error('Acknowledgement lost after commit');
        }
        return result;
      },
      close() {}
    });
    const request = command();
    await expect(storage.commitCommand(request)).rejects.toMatchObject({
      name: 'DurableCommandFailure',
      outcome: 'RECOVERY_REQUIRED',
      message: 'Acknowledgement lost after commit'
    });
    expect(storage.getItem('orders')).toBeNull();
    sql.applyBatch([{ op: 'set', key: 'orders', value: '[{"id":"one-effect","status":"SERVED"}]' }]);
    expect((await storage.commitCommand(request)).outcome).toBe('REPLAYED');
    expect(JSON.parse(storage.getItem('orders')!)[0].status).toBe('SERVED');
    expect(JSON.parse(storage.getItem('collections')!)).toHaveLength(1);
    storage.close();
  });
  it('refuses unguarded writes and backends without an atomic command protocol', async () => {
    const sql = engine();
    const request = command();
    request.expected.pop();
    expect(() => sql.applyCommand(request)).toThrow('Every command write');
    const storage = await DurableStorage.open({
      load: async () => ({}),
      write: async () => {
        throw Error('must not fall back');
      },
      close() {}
    });
    await expect(storage.commitCommand(command())).rejects.toThrow('does not support');
    storage.close();
  });
  it('carries a guarded operation and its replay result through the worker protocol', async () => {
    const sql = engine();
    const worker: WorkerLike = {
      onmessage: null,
      onerror: null,
      terminate() {},
      postMessage(message) {
        const request = message as { id: number; type: string; command: DurableCommand };
        queueMicrotask(() =>
          worker.onmessage?.({
            data: { id: request.id, ok: true, ...(request.type === 'open' ? { data: sql.loadAll() } : { result: sql.applyCommand(request.command) }) }
          })
        );
      }
    };
    const storage = await DurableStorage.open(new WorkerBackend(worker, 'operations'));
    expect((await storage.commitCommand(command())).outcome).toBe('COMMITTED');
    expect((await storage.commitCommand(command())).outcome).toBe('REPLAYED');
    expect(JSON.parse(storage.getItem('collections')!)).toHaveLength(1);
    storage.close();
  });
  it('acknowledges the same protocol through the direct engine backend', async () => {
    const storage = await DurableStorage.open(new EngineBackend(engine()));
    expect((await storage.commitCommand(command())).outcome).toBe('COMMITTED');
    expect((await storage.commitCommand(command())).outcome).toBe('REPLAYED');
    storage.close();
  });
  it('distinguishes rejected stale work from an unknown outcome and keeps storage health truthful', async () => {
    const storage = await DurableStorage.open(new EngineBackend(engine()));
    storage.setItem('stock', 'changed');
    await storage.flush();
    await expect(storage.commitCommand(command())).rejects.toMatchObject({
      name: 'DurableCommandFailure',
      outcome: 'REJECTED',
      code: 'LOCAL_VERSION_CONFLICT'
    });
    expect(storage.health()).toMatchObject({ ok: true, commitState: 'COMMITTED' });
    expect(storage.getItem('orders')).toBeNull();
    expect(new DurableCommandFailure(Error('worker stopped')).outcome).toBe('RECOVERY_REQUIRED');
    storage.close();
  });
});
