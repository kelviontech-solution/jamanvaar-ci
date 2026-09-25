import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { BranchStore } from './store';
import { BranchCore } from './core';
import { createServer } from './server';
import { CloudUplink, UplinkScheduler } from './uplink';
import { startDiscoveryResponder, lanAddresses } from './discovery';

/**
 * JAMANVAAR Branch Core: the restaurant's local operational server.
 *
 *   node branch-core.cjs activate --cloud https://api.jamanvaar.app --code XXXX-XXXX [--data DIR]
 *   node branch-core.cjs run [--data DIR] [--port 5178] [--apps kds=DIR,pos=DIR]
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
  mkdirSync(dataDir, { recursive: true });
  return new BranchStore(path.join(dataDir, 'branch-core.sqlite3'));
}

export async function activate(dataDir: string, cloudBase: string, code: string): Promise<void> {
  const res = await fetch(`${cloudBase}/api/v1/activation/redeem`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, deviceType: 'POS_ADMIN' }) });
  const data = (await res.json().catch(() => null)) as { deviceToken?: string; restaurantId?: string; device?: { id: string; branchId: string | null }; message?: string } | null;
  if (!res.ok || !data?.deviceToken || !data.device) throw new Error(data?.message ?? `Activation failed (${res.status})`);
  const store = openStore(dataDir);
  store.transaction(() => {
    store.setConfig('cloud_base', cloudBase.replace(/\/+$/, ''));
    store.setConfig('device_token', data.deviceToken!);
    store.setConfig('device_id', data.device!.id);
    store.setConfig('restaurant_id', data.restaurantId ?? '');
    store.setConfig('branch_id', data.device!.branchId ?? '');
  });
  store.close();
  console.log(`Branch Core activated as device ${data.device.id}. Run "run" to start it.`);
}

export async function run(dataDir: string, port: number, appDirs: Record<string, string>): Promise<{ stop(): Promise<void> }> {
  const store = openStore(dataDir);
  const cloudBase = store.getConfig('cloud_base');
  const token = store.getConfig('device_token');
  const restaurantId = store.getConfig('restaurant_id');
  const branchId = store.getConfig('branch_id');
  if (!cloudBase || !token || !restaurantId || !branchId) throw new Error('This Branch Core has not been activated yet (and must be bound to a branch).');

  const branches = JSON.parse(store.getConfig('branches') ?? '[]') as Array<{ id: string; code: string; timezone: string }>;
  const mine = branches.find((b) => b.id === branchId);
  const core = new BranchCore(store, { restaurantId, branchId, branchCode: mine?.code ?? 'MAIN', timezone: mine?.timezone });
  const server = createServer(core, { appDirs });
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
  console.log(`Branch Core running on port ${port}. Devices can reach it at: ${lanAddresses().map((a) => `http://${a}:${port}`).join(', ') || `http://localhost:${port}`}`);

  return {
    stop: async () => {
      scheduler.stop();
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
    await run(dataDir, Number(flags.port ?? 5178), apps);
  } else {
    throw new Error(`unknown command "${cmd}"`);
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  cli().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
