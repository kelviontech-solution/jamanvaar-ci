import { describe, expect, it } from 'vitest';
import { DurableStorage, type StorageBackend } from '../packages/database/src/durable/durable_storage';
import type { StoreOp } from '../packages/database/src/durable/sql_kv_engine';
import { SqlKvEngine } from '../packages/database/src/durable/sql_kv_engine';
import { NodeSqliteDriver } from '../packages/database/src/durable/node_driver';
import { EngineBackend } from '../packages/database/src/durable/durable_storage';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('explicit durable commit acknowledgement', () => {
  it('publishes an entire command batch only after the backend acknowledges it', async () => {
    let acknowledge!: () => void;
    const written: StoreOp[][] = [];
    const storage = await DurableStorage.open({
      load: async () => ({}),
      write: async (ops) => {
        written.push(ops);
        await new Promise<void>((resolve) => {
          acknowledge = resolve;
        });
      },
      close() {}
    });
    const command = storage.commitBatch([
      { op: 'set', key: 'order', value: 'paid' },
      { op: 'set', key: 'outbox', value: 'pending' }
    ]);
    await Promise.resolve();
    await Promise.resolve();
    expect(storage.health().commitState).toBe('PENDING');
    expect(storage.getItem('order')).toBeNull();
    acknowledge();
    await command;
    expect(written).toHaveLength(1);
    expect(written[0]).toHaveLength(2);
    expect(storage.getItem('order')).toBe('paid');
    expect(storage.getItem('outbox')).toBe('pending');
    expect(storage.health().commitState).toBe('COMMITTED');
    storage.close();
  });
  it('does not expose a rejected batch as committed and recovers on a subsequent successful batch', async () => {
    let fail = true;
    const backend: StorageBackend = {
      load: async () => ({}),
      write: async () => {
        if (fail) throw Error('Disk full');
      },
      close() {}
    };
    const storage = await DurableStorage.open(backend);
    await expect(storage.commitBatch([{ op: 'set', key: 'order', value: 'paid' }])).rejects.toThrow('Disk full');
    expect(storage.getItem('order')).toBeNull();
    expect(storage.health().commitState).toBe('FAILED');
    fail = false;
    // A caller must explicitly retry the same business operation after resolving storage failure.
    await expect(storage.flush()).rejects.toThrow('Disk full');
    await storage.commitBatch([{ op: 'set', key: 'order', value: 'paid' }]);
    expect(storage.getItem('order')).toBe('paid');
    storage.close();
  });
  it('refuses to acknowledge or accept writes after close', async () => {
    const storage = await DurableStorage.open({ load: async () => ({}), write: async () => {}, close() {} });
    storage.close();
    await expect(storage.flush()).rejects.toThrow('closed');
    await expect(storage.commitBatch([{ op: 'set', key: 'order', value: 'paid' }])).rejects.toThrow('closed');
    expect(() => storage.setItem('order', 'paid')).toThrow('closed');
    expect(storage.health().commitState).toBe('CLOSED');
  });
  it('does not overwrite a newer local edit when a preceding committed batch is acknowledged', async () => {
    let release!: () => void;
    let first = true;
    const persisted = new Map<string, string>();
    const storage = await DurableStorage.open({
      load: async () => ({}),
      write: async (ops) => {
        if (first) {
          first = false;
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        for (const op of ops) if (op.op === 'set') persisted.set(op.key, op.value);
      },
      close() {}
    });
    const commit = storage.commitBatch([{ op: 'set', key: 'order', value: 'first' }]);
    await Promise.resolve();
    await Promise.resolve();
    storage.setItem('order', 'second');
    release();
    await commit;
    await storage.flush();
    expect(storage.getItem('order')).toBe('second');
    expect(persisted.get('order')).toBe('second');
    storage.close();
  });
  it('persists a same-tick ordinary edit after the explicit batch rather than before it', async () => {
    const persisted = new Map<string, string>();
    const writes: string[] = [];
    const storage = await DurableStorage.open({
      load: async () => ({}),
      write: async (ops) => {
        for (const op of ops) {
          if (op.op === 'set') { persisted.set(op.key, op.value); writes.push(op.value); }
          else persisted.delete(op.key);
        }
      }, close() {}
    });
    storage.setItem('order', 'before');
    const commit = storage.commitBatch([{ op: 'set', key: 'order', value: 'committed' }]);
    storage.setItem('order', 'after');
    await commit;
    await storage.flush();
    expect(writes).toEqual(['before', 'committed', 'after']);
    expect(storage.getItem('order')).toBe('after');
    expect(persisted.get('order')).toBe('after');
    storage.close();
  });
  it('recovers every acknowledged command collection from a real SQLite file after reopening', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jv-commit-barrier-'));
    const open = () => DurableStorage.open(new EngineBackend(new SqlKvEngine(new NodeSqliteDriver(join(dir, 'commit.sqlite3')))));
    let storage: DurableStorage | undefined;
    try {
      storage = await open();
      await storage.commitBatch(
        ['orders', 'payments', 'inventory', 'outbox', 'operation-results'].map((key) => ({
          op: 'set' as const,
          key,
          value: JSON.stringify([{ id: 'command-1', committed: true }])
        }))
      );
      storage.close();
      storage = await open();
      for (const key of ['orders', 'payments', 'inventory', 'outbox', 'operation-results'])
        expect(JSON.parse(storage.getItem(key)!)).toEqual([{ id: 'command-1', committed: true }]);
    } finally {
      storage?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('rolls an invalid batch back in SQLite rather than partially persisting earlier operations', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jv-commit-rollback-'));
    const open = () => DurableStorage.open(new EngineBackend(new SqlKvEngine(new NodeSqliteDriver(join(dir, 'rollback.sqlite3')))));
    let storage: DurableStorage | undefined;
    try {
      storage = await open();
      await expect(
        storage.commitBatch([{ op: 'set', key: 'orders', value: 'paid' }, { op: 'set', key: 'payments', value: 123 } as unknown as StoreOp])
      ).rejects.toThrow(/must be a string/);
      expect(storage.getItem('orders')).toBeNull();
      storage.close();
      storage = await open();
      expect(storage.getItem('orders')).toBeNull();
      expect(storage.getItem('payments')).toBeNull();
    } finally {
      storage?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
