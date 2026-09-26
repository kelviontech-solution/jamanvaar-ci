import path from 'node:path';
import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { BranchStore } from './store';
import { BranchCore } from './core';
import { createServer } from './server';
import { CloudUplink, UplinkScheduler } from './uplink';
import { startDiscoveryResponder, lanAddresses } from './discovery';
import { BackupScheduler, createBackup, restoreBackup, listBackups } from './backup';
import { Supervisor } from './supervisor';
import { openSecret, sealSecret } from './secret-seal';

export const APP_VERSION = process.env.JAMANVAAR_CORE_VERSION ?? '0.1.0';

/**
 * JAMANVAAR Branch Core: the restaurant's local operational server.
 *
 *   node branch-core.cjs activate --cloud https://api.jamanvaar.app --code XXXX-XXXX [--data DIR]
 *   node branch-core.cjs run [--data DIR] [--port 5178] [--apps kds=DIR,pos=DIR] [--tls-cert F --tls-key F]
 *   node branch-core.cjs serve ...same flags as run...   (run under a supervisor: restarts on crash or hang)
 *   node branch-core.cjs backup [--data DIR] [--backup-dir DIR]     (JAMANVAAR_BACKUP_PASSPHRASE)
 *   node branch-core.cjs restore --file F [--data DIR]              (core must be stopped)
 *
 * `activate` registers this machine with the cloud (same activation key flow as every other device) and
 * stores the credential in the local database. `run` starts the local server, the cloud sync, and LAN
 * discovery. It needs no internet to run once activated.
 */

interface Args { cmd: string; flags: Record<string, string> }

function parseArgs(argv: string[]): Args {
  const [cmd = 'run', ...rest] = argv;
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : 'true';
  return { cmd, flags };
}

function openStore(dataDir: string): BranchStore {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const file = path.join(dataDir, 'branch-core.sqlite3');
  const store = new BranchStore(file);
  // The file holds the cloud credential of this branch: owner-only where the OS supports file modes (a no-op on Windows, where the user profile ACL applies).
  for (const f of [file, `${file}-wal`, `${file}-shm`]) {
    try { if (existsSync(f)) chmodSync(f, 0o600); } catch { /* best effort */ }
  }
  try { chmodSync(dataDir, 0o700); } catch { /* best effort */ }
  return store;
}

export async function activate(dataDir: string, cloudBase: string, code: string): Promise<void> {
  const res = await fetch(`${cloudBase}/api/v1/activation/redeem`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, deviceType: 'POS_ADMIN' }) });
  const data = (await res.json().catch(() => null)) as { deviceToken?: string; restaurantId?: string; device?: { id: string; branchId: string | null }; message?: string } | null;
  if (!res.ok || !data?.deviceToken || !data.device) throw new Error(data?.message ?? `Activation failed (${res.status})`);
  const store = openStore(dataDir);
  store.transaction(() => {
    store.setConfig('cloud_base', cloudBase.replace(/\/+$/, ''));
    store.setConfig('device_token', sealSecret(dataDir, data.deviceToken!));
    store.setConfig('device_id', data.device!.id);
    store.setConfig('restaurant_id', data.restaurantId ?? '');
    store.setConfig('branch_id', data.device!.branchId ?? '');
  });
  store.close();
  console.log(`Branch Core activated as device ${data.device.id}. Run "run" to start it.`);
}

export interface RunOptions { tls?: { cert: string | Buffer; key: string | Buffer }; backupDir?: string; backupPassphrase?: string; backupEveryMs?: number }

export async function run(dataDir: string, port: number, appDirs: Record<string, string>, runOpts: RunOptions = {}): Promise<{ stop(): Promise<void> }> {
  const store = openStore(dataDir);
  const cloudBase = store.getConfig('cloud_base');
  const storedToken = store.getConfig('device_token');
  const token = storedToken ? openSecret(dataDir, storedToken) : null;
  // A token saved before sealing existed is sealed now.
  if (storedToken && token && !storedToken.startsWith('enc1:')) store.setConfig('device_token', sealSecret(dataDir, token));
  const restaurantId = store.getConfig('restaurant_id');
  const branchId = store.getConfig('branch_id');
  if (!cloudBase || !token || !restaurantId || !branchId) throw new Error('This Branch Core has not been activated yet (and must be bound to a branch).');

  const branches = JSON.parse(store.getConfig('branches') ?? '[]') as Array<{ id: string; code: string; timezone: string }>;
  const mine = branches.find((b) => b.id === branchId);
  const core = new BranchCore(store, { restaurantId, branchId, branchCode: mine?.code ?? 'MAIN', timezone: mine?.timezone, appVersion: APP_VERSION });
  const server = createServer(core, { appDirs, version: APP_VERSION, tls: runOpts.tls });
  const backups = runOpts.backupPassphrase ? new BackupScheduler(store, { dir: runOpts.backupDir ?? path.join(dataDir, 'backups'), passphrase: runOpts.backupPassphrase, everyMs: runOpts.backupEveryMs }) : null;
  backups?.runNow();
  backups?.start();
  await new Promise<void>((r) => server.listen(port, '0.0.0.0', r));

  const scheduler = new UplinkScheduler(new CloudUplink(core, { cloudBase, deviceToken: token }), {
    onResult: (r) => {
      if (r.error) console.log(`[cloud] ${r.reachable ? 'problem' : 'offline'}: ${r.error}`);
    }
  });
  scheduler.start();
  // Answer whenever an order arrives so the cloud hears about it promptly.
  core.listeners.add((e) => { if (e.kind === 'orders' || e.kind === 'inventory') scheduler.poke(); });

  const discovery = await startDiscoveryResponder({ httpPort: port, restaurantId, branchCode: core.cfg.branchCode }).catch(() => null);
  console.log(`Branch Core running on port ${port}. Devices can reach it at: ${lanAddresses().map((a) => `${runOpts.tls ? 'https' : 'http'}://${a}:${port}`).join(', ') || `http://localhost:${port}`}`);

  return {
    stop: async () => {
      scheduler.stop();
      backups?.stop();
      discovery?.close();
      await new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()); });
      store.close();
    }
  };
}

async function cli(): Promise<void> {
  const { cmd, flags } = parseArgs(process.argv.slice(2));
  const dataDir = flags.data ?? path.join(process.env.PROGRAMDATA ?? process.env.HOME ?? '.', 'JAMANVAAR', 'branch-core');
  if (cmd === 'activate') {
    if (!flags.cloud || !flags.code) throw new Error('usage: activate --cloud <url> --code <activation key> [--data DIR]');
    await activate(dataDir, flags.cloud, flags.code);
  } else if (cmd === 'run') {
    const apps: Record<string, string> = {};
    (flags.apps ?? '').split(',').filter(Boolean).forEach((kv) => { const [k, v] = kv.split('='); if (k && v) apps[k] = path.resolve(v); });
    const tls = flags['tls-cert'] && flags['tls-key'] ? { cert: readFileSync(flags['tls-cert']), key: readFileSync(flags['tls-key']) } : undefined;
    await run(dataDir, Number(flags.port ?? 5178), apps, { tls, backupPassphrase: process.env.JAMANVAAR_BACKUP_PASSPHRASE, backupDir: flags['backup-dir'] });
  } else if (cmd === 'serve') {
    const args = process.argv.slice(2).map((a, i) => (i === 0 ? 'run' : a));
    const port = Number(flags.port ?? 5178);
    const sup = new Supervisor({ command: process.execPath, args: [...process.argv.slice(1, 2), ...args], healthUrl: `${flags['tls-cert'] ? 'https' : 'http'}://127.0.0.1:${port}/health`, logFile: path.join(dataDir, 'core.log'), log: (l) => console.log(l) });
    sup.start();
    const quit = () => void sup.stop().then(() => process.exit(0));
    process.on('SIGINT', quit);
    process.on('SIGTERM', quit);
  } else if (cmd === 'backup') {
    const pass = process.env.JAMANVAAR_BACKUP_PASSPHRASE;
    if (!pass) throw new Error('Set JAMANVAAR_BACKUP_PASSPHRASE (at least 8 characters)');
    const store = openStore(dataDir);
    const r = createBackup(store, flags['backup-dir'] ?? path.join(dataDir, 'backups'), pass);
    store.close();
    console.log(`Backup written: ${r.file}`);
  } else if (cmd === 'restore') {
    const pass = process.env.JAMANVAAR_BACKUP_PASSPHRASE;
    if (!pass || !flags.file) throw new Error('usage: restore --file <backup> [--data DIR] with JAMANVAAR_BACKUP_PASSPHRASE set');
    const r = restoreBackup(flags.file, pass, path.join(dataDir, 'branch-core.sqlite3'));
    console.log(`Restored (database version ${r.schemaVersion}). Previous database kept as branch-core.sqlite3.before-restore. Backups available: ${listBackups(path.join(dataDir, 'backups')).length}`);
  } else {
    throw new Error(`unknown command "${cmd}"`);
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  cli().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
