import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { BranchStore } from '../packages/branch-core/src/store';
import { BranchCore, SYNC_PROTOCOL_VERSION } from '../packages/branch-core/src/core';
import { createServer } from '../packages/branch-core/src/server';
import { createBackup, restoreBackup, listBackups, decryptBytes, BackupError } from '../packages/branch-core/src/backup';
import { Supervisor } from '../packages/branch-core/src/supervisor';
import { DeviceCommandRunner } from '../packages/sync/src/device_commands';
import { signCommand, verifyCommand, tokenKey } from '../packages/sync/src/command_signing';

const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'jv-ops-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const ROSTER = {
  restaurant: { id: 'rest-1', name: 'Demo', status: 'ACTIVE' },
  branches: [{ id: 'br-1', name: 'A', code: 'AHD', timezone: 'Asia/Kolkata', status: 'ACTIVE' }],
  subscription: { active: true, expiresAt: null, enabledApps: ['POS', 'KDS', 'POS_ADMIN'] },
  devices: [
    { id: 'pos-1', type: 'POS', name: 'POS 1', branchId: 'br-1', status: 'ACTIVE', isLocked: false, tokenHash: sha('tok-pos'), appEnabled: true },
    { id: 'admin', type: 'POS_ADMIN', name: 'Admin', branchId: null, status: 'ACTIVE', isLocked: false, tokenHash: sha('tok-admin'), appEnabled: true }
  ]
};

function newCore(file = ':memory:', appVersion = '1.2.3') {
  const core = new BranchCore(new BranchStore(file), { restaurantId: 'rest-1', branchId: 'br-1', branchCode: 'AHD', appVersion });
  core.applyRoster(ROSTER);
  return core;
}
const ev = (id: string) => ({
  externalOrderId: id, orderType: 'TAKEAWAY', status: 'NEW', items: [{ externalItemId: `${id}-a`, name: 'Tea', quantity: 1, unitPrice: 100, modifiers: [], lineTotal: 100 }],
  subtotal: 100, taxAmount: 5, discountAmount: 0, totalAmount: 105, updatedAt: new Date().toISOString()
});
const pos = () => ({ id: 'pos-1', type: 'POS', branchId: 'br-1', restaurantId: 'rest-1', name: 'POS 1', isLocked: false, lockReason: null });

describe('encrypted backups', () => {
  it('backs up a running core and restores every order exactly', () => {
    const d = tmp();
    const file = join(d, 'core.sqlite3');
    const core = newCore(file);
    core.ingestOrders(pos(), [ev('o1'), ev('o2')]);
    const b = createBackup(core.store, join(d, 'backups'), 'correct horse battery');
    core.ingestOrders(pos(), [ev('o3')]); // after the backup
    core.store.close();

    restoreBackup(b.file, 'correct horse battery', file);
    const restored = new BranchStore(file);
    expect(restored.all<{ external_order_id: string }>('SELECT external_order_id FROM orders ORDER BY external_order_id').map((r) => r.external_order_id)).toEqual(['o1', 'o2']);
    expect(existsSync(`${file}.before-restore`)).toBe(true); // the newer database is not destroyed
    restored.close();
  });

  it('the file on disk is genuinely encrypted, and a wrong passphrase or tampering is refused', () => {
    const d = tmp();
    const core = newCore(join(d, 'core.sqlite3'));
    core.ingestOrders(pos(), [ev('secret-order')]);
    const { file } = createBackup(core.store, join(d, 'backups'), 'passphrase-1');
    const bytes = readFileSync(file);
    expect(bytes.includes(Buffer.from('secret-order'))).toBe(false);
    expect(bytes.includes(Buffer.from('SQLite format'))).toBe(false);

    expect(() => decryptBytes(bytes, 'wrong-passphrase')).toThrow(BackupError);
    const tampered = Buffer.from(bytes);
    tampered[tampered.length - 5] ^= 0xff;
    expect(() => decryptBytes(tampered, 'passphrase-1')).toThrow(/damaged|Wrong passphrase/);
    expect(() => restoreBackup(file, 'wrong-passphrase', join(d, 'x.sqlite3'))).toThrow(BackupError);
    expect(existsSync(join(d, 'x.sqlite3'))).toBe(false); // nothing partially restored
    core.store.close();
  });

  it('keeps only the newest N backups and leaves no temp files behind', () => {
    const d = tmp();
    const core = newCore(join(d, 'core.sqlite3'));
    let t = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 5; i++) createBackup(core.store, join(d, 'backups'), 'passphrase-1', { keep: 3, now: () => (t += 60_000) });
    expect(listBackups(join(d, 'backups'))).toHaveLength(3);
    expect(readdirSync(join(d, 'backups')).filter((f) => f.endsWith('.part') || f.endsWith('.tmp.sqlite'))).toEqual([]);
    core.store.close();
  });

  it('refuses a passphrase that is too short', () => {
    const core = newCore();
    expect(() => createBackup(core.store, join(tmp(), 'b'), 'short')).toThrow(/at least 8/);
    core.store.close();
  });
});

describe('version report', () => {
  it('reports app, database, sync protocol, menu and config versions', () => {
    const core = newCore();
    const s = core.status();
    expect(s.versions).toMatchObject({ app: '1.2.3', database: core.store.schemaVersion, syncProtocol: SYNC_PROTOCOL_VERSION, menu: 0, config: 0 });
    core.store.close();
  });
});

describe('signed commands over the LAN', () => {
  it('the core signs commands with a key only it and the device hold; the device verifies', async () => {
    const core = newCore();
    core.issueCommand({ id: 'admin', type: 'POS_ADMIN', branchId: null, restaurantId: 'rest-1', name: 'Admin', isLocked: false, lockReason: null }, 'pos-1', { commandType: 'REQUEST_SYNC', payload: { scope: 'ALL' } } as never);
    const [cmd] = core.pendingCommands(pos()) as Array<{ id: string; commandType: string; payload: unknown; signature?: string }>;
    expect(cmd.signature).toMatch(/^[0-9a-f]{64}$/);

    const key = await tokenKey('tok-pos');
    expect(await verifyCommand(key, { id: cmd.id, commandType: cmd.commandType, payload: cmd.payload, deviceId: 'pos-1' }, cmd.signature)).toBe(true);
    // Any change to the command, another device's key, or no signature at all is refused.
    expect(await verifyCommand(key, { id: cmd.id, commandType: 'RESTART_APP', payload: cmd.payload, deviceId: 'pos-1' }, cmd.signature)).toBe(false);
    expect(await verifyCommand(key, { id: cmd.id, commandType: cmd.commandType, payload: cmd.payload, deviceId: 'pos-2' }, cmd.signature)).toBe(false);
    expect(await verifyCommand(await tokenKey('tok-other'), { id: cmd.id, commandType: cmd.commandType, payload: cmd.payload, deviceId: 'pos-1' }, cmd.signature)).toBe(false);
    expect(await verifyCommand(key, { id: cmd.id, commandType: cmd.commandType, payload: cmd.payload, deviceId: 'pos-1' }, undefined)).toBe(false);
    core.store.close();
  });

  it('a forged command is refused by the device and never executed; a genuine one runs', async () => {
    DeviceCommandRunner.reset();
    let ran = 0;
    DeviceCommandRunner.registerHandler('DO_THING', async () => { ran++; });
    const key = await tokenKey('tok-pos');
    const genuine = { id: 'c1', commandType: 'DO_THING', payload: {}, signature: await signCommand(key, { id: 'c1', commandType: 'DO_THING', payload: {}, deviceId: 'pos-1' }) };
    const forged = { id: 'c2', commandType: 'DO_THING', payload: {}, signature: 'f'.repeat(64) };
    const acks: Record<string, string> = {};
    const out = await DeviceCommandRunner.run(
      { list: async () => [genuine, forged], ack: async (id, o) => { acks[id] = o.status; } },
      async (c) => verifyCommand(key, { id: c.id, commandType: c.commandType, payload: c.payload, deviceId: 'pos-1' }, c.signature)
    );
    expect(ran).toBe(1);
    expect(out).toEqual({ executed: 1, failed: 1 });
    expect(acks).toEqual({ c1: 'SUCCEEDED', c2: 'FAILED' });
    DeviceCommandRunner.reset();
  });
});

describe('the core serves the apps and can use TLS', () => {
  it('serves a built app (KDS) from the core itself, with the index as fallback, and refuses path escapes', async () => {
    const d = tmp();
    mkdirSync(join(d, 'kds', 'assets'), { recursive: true });
    writeFileSync(join(d, 'kds', 'index.html'), '<html>KDS</html>');
    writeFileSync(join(d, 'kds', 'assets', 'app.js'), 'console.log(1)');
    writeFileSync(join(d, 'secret.txt'), 'nope');
    const core = newCore();
    const server = createServer(core, { appDirs: { kds: join(d, 'kds') } });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    expect(await (await fetch(`${base}/apps/kds/`)).text()).toContain('KDS');
    expect((await fetch(`${base}/apps/kds/assets/app.js`)).headers.get('content-type')).toContain('javascript');
    expect(await (await fetch(`${base}/apps/kds/some/client/route`)).text()).toContain('KDS'); // SPA fallback
    const escape = await fetch(`${base}/apps/kds/..%2Fsecret.txt`);
    expect(await escape.text()).not.toContain('nope');
    await new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()); });
    core.store.close();
  });

  it('serves HTTPS with a certificate whose fingerprint is advertised for pairing', async () => {
    const d = tmp();
    try {
      execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(d, 'k.pem'), '-out', join(d, 'c.pem'), '-days', '2', '-subj', '/CN=jamanvaar-branch-core'], { stdio: 'ignore' });
    } catch {
      return; // openssl unavailable on this machine: the HTTP path above is still covered
    }
    const cert = readFileSync(join(d, 'c.pem'));
    const core = newCore();
    const server = createServer(core, { tls: { cert, key: readFileSync(join(d, 'k.pem')) } });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    const get = (path: string, opts: https.RequestOptions = {}) => new Promise<{ status: number; body: string }>((resolve, reject) => {
      https.get({ host: '127.0.0.1', port, path, ...opts }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode ?? 0, body: b })); }).on('error', reject);
    });
    // A device that has not been given the branch certificate does not trust it.
    await expect(get('/discover')).rejects.toThrow();
    // A paired device trusts exactly that certificate.
    const r = await get('/discover', { ca: cert, checkServerIdentity: () => undefined });
    const info = JSON.parse(r.body);
    expect(info.tls).toBe(true);
    expect(info.tlsFingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    await new Promise<void>((r2) => { server.closeAllConnections?.(); server.close(() => r2()); });
    core.store.close();
  });
});

/** Process start-up time varies a lot between machines, so wait for the condition rather than a fixed time. */
async function waitFor(cond: () => boolean, ms = 25_000) {
  const end = Date.now() + ms;
  while (Date.now() < end && !cond()) await new Promise((r) => setTimeout(r, 100));
}
const runsOf = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8').length : 0);

describe('supervisor keeps the core running', () => {
  it('restarts a process that crashes, and stops restarting when told to stop', async () => {
    const d = tmp();
    const script = join(d, 'crashy.js');
    writeFileSync(script, `require('fs').appendFileSync(${JSON.stringify(join(d, 'runs.txt'))}, 'x'); setTimeout(() => process.exit(1), 50);`);
    const lines: string[] = [];
    const sup = new Supervisor({ command: process.execPath, args: [script], minBackoffMs: 30, maxBackoffMs: 60, stableAfterMs: 10_000, log: (l) => lines.push(l), logFile: join(d, 'core.log') });
    sup.start();
    await waitFor(() => runsOf(join(d, 'runs.txt')) >= 3);
    await sup.stop();
    const runs = runsOf(join(d, 'runs.txt'));
    expect(runs, lines.join(' | ')).toBeGreaterThanOrEqual(3);
    expect(sup.restarts, lines.join(' | ')).toBeGreaterThanOrEqual(2);
    expect(readFileSync(join(d, 'core.log'), 'utf8')).toMatch(/restarting in/);
    const after = runsOf(join(d, 'runs.txt'));
    await new Promise((r) => setTimeout(r, 800));
    expect(runsOf(join(d, 'runs.txt'))).toBe(after); // really stopped
  }, 40_000);

  it('kills and restarts a process that is alive but no longer answering its health check', async () => {
    const d = tmp();
    const script = join(d, 'hung.js');
    writeFileSync(script, `require('fs').appendFileSync(${JSON.stringify(join(d, 'runs.txt'))}, 'x'); setInterval(() => {}, 1000);`); // runs, never serves /health
    const dead = http.createServer((_, res) => { res.writeHead(500); res.end(); });
    await new Promise<void>((r) => dead.listen(0, '127.0.0.1', r));
    const sup = new Supervisor({ command: process.execPath, args: [script], healthUrl: `http://127.0.0.1:${(dead.address() as AddressInfo).port}/health`, healthEveryMs: 100, healthFailuresBeforeRestart: 2, minBackoffMs: 30, maxBackoffMs: 60, log: () => undefined });
    sup.start();
    await waitFor(() => runsOf(join(d, 'runs.txt')) >= 2);
    await sup.stop();
    dead.close();
    expect(runsOf(join(d, 'runs.txt'))).toBeGreaterThanOrEqual(2);
  }, 40_000);
});
