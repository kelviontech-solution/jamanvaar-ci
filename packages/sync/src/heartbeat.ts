import { db, KeyValueStore, TenantIsolation, MenuRepository } from '@jamanvaar/database';
import { DeviceGate, type HeartbeatAnswer } from './device_gate';
import { SyncOutboxEngine } from './outbox';
import { DeviceCommandRunner } from './device_commands';
import { MenuVersionTracker } from './menu_version';
import { RealtimeClient } from './realtime_client';
import { EndpointResolver } from './endpoint_resolver';
import { InventoryLedgerSync } from './inventory_ledger_sync';
import { syncMenuCatalog } from './menu_sync';
import { tokenKey, verifyCommand } from './command_signing';
import { EntitySyncEngine } from './entity_sync';

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

/** Sends an operational request to the Branch Core if there is one and it is reachable, otherwise to the cloud. */
function routed(opts: HeartbeatOpts, path: string, init?: RequestInit): Promise<Response> {
  EndpointResolver.ensureConfigured(opts.apiBase);
  return EndpointResolver.fetch(path, init, (url, i) => DeviceGate.gatedFetch(url, i));
}

/** Fetches this device's queued commands, runs the ones the app supports, and acknowledges each. */
async function runDeviceCommands(opts: HeartbeatOpts): Promise<void> {
  DeviceCommandRunner.registerDefaults();
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.deviceToken}` };
  let fromCore = false;
  await DeviceCommandRunner.run({
    async list() {
      const r = await routed(opts, '/api/v1/devices/me/commands', { headers });
      if (!r.ok) throw new Error(`commands ${r.status}`);
      const list = (await r.json()) as Array<{ id: string; commandType: string; payload?: unknown; signature?: string }>;
      fromCore = EndpointResolver.responderFor(r) === 'core';
      return list;
    },
    async ack(id, outcome) {
      await routed(opts, `/api/v1/devices/me/commands/${id}/ack`, { method: 'POST', headers, body: JSON.stringify(outcome) });
    }
  }, async (cmd) => {
    // Commands from the cloud arrive over TLS from a trusted origin. Anything from a Branch Core on the LAN must carry the core's signature.
    if (!fromCore) return true;
    const deviceId = DeviceGate.getState().deviceId;
    if (!deviceId) return false; // this device does not yet know its own id: fail closed
    return verifyCommand(await tokenKey(opts.deviceToken), { id: cmd.id, commandType: cmd.commandType, payload: cmd.payload, deviceId }, cmd.signature);
  });
}

let realtime: RealtimeClient | null = null;
let realtimeToken: string | null = null;
export function stopRealtime(): void {
  realtime?.stop(); realtime = null; realtimeToken = null;
}

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
      else if (kind.startsWith('entity:')) EntitySyncEngine.wake(kind.slice(7));
      else if (kind === 'entities') EntitySyncEngine.wake();
    },
    onReady: () => { void SyncOutboxEngine.catchUpFromCloud(); EntitySyncEngine.wake(); void InventoryLedgerSync.sync(); },
    onDenied: (response) => DeviceGate.observe(response),
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
    const res = await routed(opts, '/api/v1/devices/me/heartbeat', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.deviceToken}` },
      body: JSON.stringify(buildHeartbeatBody(opts.appVersion))
    });
    if (res.ok) {
      const answer = (await res.json()) as HeartbeatAnswer;
      const previousBranch = KeyValueStore.get('jamanvaar_bound_branch_id');
      const restaurantId = answer.restaurantId ?? opts.restaurantId;
      if (answer.deviceId) EndpointResolver.setIdentity(`${answer.deviceId}:${answer.branchId ?? 'all'}`);
      if (answer.branchId !== undefined && previousBranch !== (answer.branchId ?? '') && restaurantId) {
        // Unknown legacy branch ownership is recovered from the authorized cloud snapshot. Unsent orders are quarantined.
        if (answer.branchId || previousBranch) {
          TenantIsolation.reset(restaurantId);
          MenuRepository.startFreshMenu();
        }
      }
      if (answer.branchId !== undefined) KeyValueStore.set('jamanvaar_bound_branch_id', answer.branchId ?? '');
      await DeviceGate.applyHeartbeatAsync(answer, {
        restaurantId: answer.restaurantId ?? opts.restaurantId ?? undefined,
        branchId: answer.branchId !== undefined ? answer.branchId : opts.branchId,
        deviceId: answer.deviceId ?? opts.deviceId
      });
      void MenuVersionTracker.refresh(async () => {
        const r = await routed(opts, '/api/v1/menu/version', { headers: { Authorization: `Bearer ${opts.deviceToken}` } });
        return r.ok ? ((await r.json()) as { version: number; watermark: string | null }) : null;
      });
      startRealtime(opts);
      await runDeviceCommands(opts);
    }
  } catch {
    // Best-effort: a missed heartbeat is retried on the next tick.
  }
}
