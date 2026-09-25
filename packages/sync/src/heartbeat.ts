import { db } from '@jamanvaar/database';
import { DeviceGate, type HeartbeatAnswer } from './device_gate';
import { SyncOutboxEngine } from './outbox';
import { DeviceCommandRunner } from './device_commands';
import { MenuVersionTracker } from './menu_version';
import { RealtimeClient } from './realtime_client';
import { InventoryLedgerSync } from './inventory_ledger_sync';
import { syncMenuCatalog } from './menu_sync';

/** A readable OS name for the fleet list ("Windows", "Android", ...). Never throws. */
export function detectOsPlatform(): string | undefined {
  try {
    const nav = (globalThis as { navigator?: { userAgentData?: { platform?: string }; platform?: string } }).navigator;
    return nav?.userAgentData?.platform || nav?.platform || undefined;
  } catch {
    return undefined;
  }
}

/** What a terminal tells the cloud about itself, from real state (BUG-065/069): its version, OS and sync backlog. */
export function buildHeartbeatBody(appVersion: string) {
  const stats = SyncOutboxEngine.getSyncStats();
  const persistence = db.getPersistenceHealth();
  const problems: string[] = [];
  if (!persistence.ok) problems.push(`Local storage is failing (${persistence.error}); recent changes are not saved on this device`);
  if (stats.deadLetterCount > 0) problems.push(`${stats.deadLetterCount} order(s) could not be synced and the device gave up: needs attention`);
  if (stats.failedCount > 0) problems.push(`${stats.failedCount} change(s) could not be synced`);
  return {
    syncStatus: problems.length > 0 ? 'error' : stats.pendingCount > 0 ? 'pending' : 'ok',
    appVersion,
    osPlatform: detectOsPlatform(),
    pendingSyncCount: stats.pendingCount,
    menuVersion: MenuVersionTracker.applied(),
    syncError: problems.length > 0 ? problems.join('; ').slice(0, 290) : null
  };
}


type HeartbeatOpts = { apiBase: string; deviceToken: string };

/** Fetches this device's queued commands, runs the ones the app supports, and acknowledges each. */
async function runDeviceCommands(opts: HeartbeatOpts): Promise<void> {
  DeviceCommandRunner.registerDefaults();
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.deviceToken}` };
  await DeviceCommandRunner.run({
    async list() {
      const r = await DeviceGate.gatedFetch(`${opts.apiBase}/api/v1/devices/me/commands`, { headers });
      if (!r.ok) throw new Error(`commands ${r.status}`);
      return (await r.json()) as Array<{ id: string; commandType: string; payload?: unknown }>;
    },
    async ack(id, outcome) {
      await DeviceGate.gatedFetch(`${opts.apiBase}/api/v1/devices/me/commands/${id}/ack`, { method: 'POST', headers, body: JSON.stringify(outcome) });
    }
  });
}

let realtime: RealtimeClient | null = null;
let realtimeToken: string | null = null;

/**
 * Opens the realtime channel once per credential. Each wake-up just triggers the matching cursor-based
 * pull, so polling remains the safety net if the connection is down or an event is missed.
 */
function startRealtime(opts: HeartbeatOpts): void {
  if (realtime && realtimeToken === opts.deviceToken) return;
  realtime?.stop();
  realtimeToken = opts.deviceToken;
  realtime = new RealtimeClient({
    apiBase: opts.apiBase,
    deviceToken: opts.deviceToken,
    onChange: (kind) => {
      if (kind === 'orders') void SyncOutboxEngine.catchUpFromCloud();
      else if (kind === 'inventory') void InventoryLedgerSync.sync();
      else if (kind === 'menu') void syncMenuCatalog({ push: false });
    },
    onCommand: () => void runDeviceCommands(opts),
    onRevoked: () => {
      realtime = null;
      realtimeToken = null;
    }
  });
  realtime.start();
}

/**
 * The one heartbeat every terminal app sends (BUG-065/069/077). Reports its real state, and applies the
 * answer: the lock decision, the platform notice, any update offer, and any signed offline extension.
 */
export async function sendHeartbeat(opts: {
  apiBase: string;
  deviceToken: string;
  appVersion: string;
  restaurantId?: string | null;
  branchId?: string | null;
  deviceId?: string | null;
}): Promise<void> {
  try {
    const res = await DeviceGate.gatedFetch(`${opts.apiBase}/api/v1/devices/me/heartbeat`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.deviceToken}` },
      body: JSON.stringify(buildHeartbeatBody(opts.appVersion))
    });
    if (res.ok) {
      await DeviceGate.applyHeartbeatAsync((await res.json()) as HeartbeatAnswer, {
        restaurantId: opts.restaurantId ?? undefined,
        branchId: opts.branchId,
        deviceId: opts.deviceId
      });
      void MenuVersionTracker.refresh(async () => {
        const r = await DeviceGate.gatedFetch(`${opts.apiBase}/api/v1/menu/version`, { headers: { Authorization: `Bearer ${opts.deviceToken}` } });
        return r.ok ? ((await r.json()) as { version: number; watermark: string | null }) : null;
      });
      await runDeviceCommands(opts);
      startRealtime(opts);
    }
  } catch {
    // Best-effort: a missed heartbeat is retried on the next tick.
  }
}
