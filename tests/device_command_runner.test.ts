import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DeviceCommandRunner, DeviceCommandRecord, CommandOutcome } from '../packages/sync/src/device_commands';

function harness(commands: DeviceCommandRecord[]) {
  const acks: Array<{ id: string; outcome: CommandOutcome }> = [];
  return {
    acks,
    io: {
      async list() { return commands; },
      async ack(id: string, outcome: CommandOutcome) { acks.push({ id, outcome }); }
    }
  };
}

const store = new Map<string, string>();

describe('DeviceCommandRunner', () => {
  it('finishes logout only after a successful acknowledgement and rechecks safety after an ACK failure', async () => {
    let safe = true; let loggedOut = false;
    DeviceCommandRunner.registerHandler('FORCE_LOGOUT', async () => { if (!safe) throw Error('Payment active'); return {}; }, { recheckBeforeAcknowledgement: true });
    DeviceCommandRunner.registerAfterAcknowledgement('FORCE_LOGOUT', () => { loggedOut = true; });
    const h = harness([{ id: 'logout', commandType: 'FORCE_LOGOUT' }]);
    await DeviceCommandRunner.run({ ...h.io, ack: async () => { throw Error('connection lost'); } });
    expect(loggedOut).toBe(false);
    safe = false; await DeviceCommandRunner.run(h.io);
    expect(h.acks[0].outcome).toMatchObject({ status: 'FAILED', error: 'Payment active' }); expect(loggedOut).toBe(false);
    safe = true; await DeviceCommandRunner.run(h.io); expect(loggedOut).toBe(true);
  });
  const original = (globalThis as any).localStorage;
  beforeEach(() => {
    store.clear();
    (globalThis as any).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k)
    };
    DeviceCommandRunner.reset();
  });
  afterEach(() => { (globalThis as any).localStorage = original; });

  it('runs a registered handler and reports SUCCEEDED with its result', async () => {
    DeviceCommandRunner.registerHandler('REQUEST_DIAGNOSTICS', async () => ({ pending: 3 }));
    const h = harness([{ id: 'c1', commandType: 'REQUEST_DIAGNOSTICS' }]);
    const summary = await DeviceCommandRunner.run(h.io);
    expect(h.acks).toEqual([{ id: 'c1', outcome: { status: 'SUCCEEDED', result: { pending: 3 } } }]);
    expect(summary).toEqual({ executed: 1, failed: 0 });
  });

  it('reports a command this app cannot perform as FAILED, honestly, instead of pretending', async () => {
    const h = harness([{ id: 'c2', commandType: 'WIPE_LOCAL_DATA' }]);
    await DeviceCommandRunner.run(h.io);
    expect(h.acks[0].outcome.status).toBe('FAILED');
    expect(h.acks[0].outcome.error).toMatch(/not supported/i);
  });

  it('a handler that throws is reported FAILED with its message and does not stop the next command', async () => {
    DeviceCommandRunner.registerHandler('CLEAR_CACHE', async () => { throw new Error('disk busy'); });
    DeviceCommandRunner.registerHandler('REQUEST_HEALTH', async () => ({ ok: true }));
    const h = harness([{ id: 'c3', commandType: 'CLEAR_CACHE' }, { id: 'c4', commandType: 'REQUEST_HEALTH' }]);
    const summary = await DeviceCommandRunner.run(h.io);
    expect(h.acks.map((a) => [a.id, a.outcome.status])).toEqual([['c3', 'FAILED'], ['c4', 'SUCCEEDED']]);
    expect(h.acks[0].outcome.error).toBe('disk busy');
    expect(summary).toEqual({ executed: 1, failed: 1 });
  });

  it('a command redelivered after a crash is acknowledged again but never executed twice', async () => {
    let runs = 0;
    DeviceCommandRunner.registerHandler('RESTART_APP', async () => { runs++; return {}; });
    const cmd = [{ id: 'c5', commandType: 'RESTART_APP' }];
    await DeviceCommandRunner.run(harness(cmd).io);
    const again = harness(cmd);
    await DeviceCommandRunner.run(again.io);
    expect(runs).toBe(1);
    expect(again.acks[0].outcome.status).toBe('SUCCEEDED');
  });

  it('lock and unlock are applied by the heartbeat gate, so the runner just confirms them', async () => {
    const h = harness([{ id: 'c6', commandType: 'LOCK' }, { id: 'c7', commandType: 'UNLOCK' }]);
    await DeviceCommandRunner.run(h.io);
    expect(h.acks.map((a) => a.outcome.status)).toEqual(['SUCCEEDED', 'SUCCEEDED']);
  });

  it('a failure to fetch commands is not fatal', async () => {
    const summary = await DeviceCommandRunner.run({ async list() { throw new Error('offline'); }, async ack() {} });
    expect(summary).toEqual({ executed: 0, failed: 0 });
  });

  it('REQUEST_SYNC carries its scope to the handler', async () => {
    const seen: string[] = [];
    DeviceCommandRunner.registerHandler('REQUEST_SYNC', async (cmd) => { seen.push(String((cmd.payload as any)?.scope ?? 'ALL')); return {}; });
    await DeviceCommandRunner.run(harness([{ id: 'c8', commandType: 'REQUEST_SYNC', payload: { scope: 'MENU' } }]).io);
    expect(seen).toEqual(['MENU']);
  });
});
