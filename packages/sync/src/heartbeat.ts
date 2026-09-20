import { DeviceGate, type HeartbeatAnswer } from './device_gate';
import { SyncOutboxEngine } from './outbox';

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
  return {
    syncStatus: stats.failedCount > 0 ? 'error' : stats.pendingCount > 0 ? 'pending' : 'ok',
    appVersion,
    osPlatform: detectOsPlatform(),
    pendingSyncCount: stats.pendingCount,
    syncError: stats.failedCount > 0 ? `${stats.failedCount} change(s) could not be synced` : null
  };
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
    }
  } catch {
    // Best-effort: a missed heartbeat is retried on the next tick.
  }
}
