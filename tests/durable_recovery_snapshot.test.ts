import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { SqlKvEngine, type DurableCommand } from '../packages/database/src/durable/sql_kv_engine';
import { NodeSqliteDriver } from '../packages/database/src/durable/node_driver';
import { DurableStorage, EngineBackend } from '../packages/database/src/durable/durable_storage';
const scope = 'restaurant:branch:pos';
const command: DurableCommand = { operationId: 'same-payment', requestFingerprint: 'a'.repeat(64), expected: [{ key: 'collections', value: null }], ops: [{ op: 'set', key: 'collections', value: '[{"id":"collection-one","paise":10000}]' }], result: '{"collectionId":"collection-one"}' };
let dir: string;
const engines: SqlKvEngine[] = [];
function engine(name: string) { const value = new SqlKvEngine(new NodeSqliteDriver(join(dir, name + '.sqlite3'))); value.init(); engines.push(value); return value; }
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'jv-recovery-')); });
afterEach(() => {
  for (const value of engines.splice(0)) { try { value.close(); } catch { /* backend already closed */ } }
  if (!resolve(dir).startsWith(resolve(tmpdir()) + sep)) throw Error('Unsafe test cleanup target');
  rmSync(dir, { recursive: true, force: true });
});
describe('complete local operation recovery', () => {
  it('restores operation results with their effects, so a pre-backup retry cannot collect twice', () => {
    const source = engine('source'); source.applyCommand(command);
    const snapshot = source.exportRecovery(scope);
    expect(snapshot.commands).toHaveLength(1);
    const target = engine('target'); target.restoreRecovery(snapshot, scope);
    expect(target.applyCommand(command).outcome).toBe('REPLAYED');
    expect(JSON.parse(target.loadAll().collections)).toEqual([{ id: 'collection-one', paise: 10000 }]);
    target.close(); const reopened = engine('target');
    expect(reopened.applyCommand(command).outcome).toBe('REPLAYED');
  });
  it('refuses restoring an old snapshot over existing operational or replay history', () => {
    const source = engine('source'); source.applyCommand(command);
    const snapshot = source.exportRecovery(scope), target = engine('target');
    target.applyBatch([{ op: 'set', key: 'new-payment', value: 'live' }]);
    expect(() => target.restoreRecovery(snapshot, scope)).toThrow('empty target');
    expect(target.loadAll()).toEqual({ 'new-payment': 'live' });
  });
  it('rejects wrong scope, unsupported versions and corrupt or duplicate operation results before any writes', () => {
    const source = engine('source'); source.applyCommand(command);
    const snapshot = source.exportRecovery(scope), target = engine('target');
    expect(() => target.restoreRecovery(snapshot, 'another-restaurant')).toThrow('scope');
    expect(() => target.restoreRecovery({ ...snapshot, version: 99 } as never, scope)).toThrow('format');
    expect(() => target.restoreRecovery({ ...snapshot, commands: [...snapshot.commands, ...snapshot.commands] }, scope)).toThrow('operation ledger');
    expect(() => target.restoreRecovery({ ...snapshot, commands: [{ ...snapshot.commands[0], result: 'broken json' }] }, scope)).toThrow();
    expect(target.loadAll()).toEqual({});
  });
  it('includes ordinary values and published collections without changing the legacy key/value export contract', () => {
    const source = engine('source'); source.applyCommand(command);
    source.applyBatch([{ op: 'set', key: 'settings', value: '{"theme":"dark"}' }]);
    const snapshot = source.exportRecovery(scope);
    expect(Object.keys(source.loadAll()).sort()).toEqual(['collections', 'settings']);
    const target = engine('target'); target.restoreRecovery(snapshot, scope);
    expect(target.loadAll()).toEqual(source.loadAll());
  });
  it('exports after pending writes commit and restores through the acknowledged storage API', async () => {
    const source = await DurableStorage.open(new EngineBackend(engine('source')));
    await source.commitCommand(command); source.setItem('pending', 'included');
    const snapshot = await source.exportRecovery(scope);
    expect(snapshot.values.pending).toBe('included');
    const target = await DurableStorage.open(new EngineBackend(engine('target')));
    await target.restoreRecovery(snapshot, scope);
    expect(target.getItem('pending')).toBe('included');
    expect((await target.commitCommand(command)).outcome).toBe('REPLAYED');
    await expect(target.restoreRecovery(snapshot, scope)).rejects.toThrow('empty');
    source.close(); target.close();
  });
});
