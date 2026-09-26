import { db } from '@jamanvaar/database';
import { EndpointResolver } from './endpoint_resolver';
import { SyncOutboxEngine } from './outbox';
import { DeviceGate } from './device_gate';

/**
 * What staff see and can do about connectivity, with no developer tools: a plain status line, the Branch
 * Core address (set by typing it or pairing, never hard-coded), a "Sync now" action, and the numbers
 * support needs. Pure logic here; the panel that displays it lives in the UI package.
 */
export type StatusTone = 'ok' | 'local' | 'busy' | 'error';

export interface ConnectionStatus {
  label: string;
  detail: string;
  tone: StatusTone;
}

export function connectionStatus(): ConnectionStatus {
  const stats = SyncOutboxEngine.getSyncStats();
  const mode = EndpointResolver.mode();
  if (stats.deadLetterCount > 0 || stats.failedCount > 0) {
    const n = stats.deadLetterCount + stats.failedCount;
    return { label: 'SYNC ERROR ⚠', detail: `${n} change(s) could not be sent. Nothing is lost; open Diagnostics to retry.`, tone: 'error' };
  }
  if (stats.pendingCount > 0 && mode !== 'OFFLINE') {
    return { label: 'SYNCING', detail: `Sending ${stats.pendingCount} change(s)…`, tone: 'busy' };
  }
  if (mode === 'ONLINE') return { label: 'ONLINE ● Connected', detail: 'Connected to the cloud. Everything is up to date.', tone: 'ok' };
  if (mode === 'LOCAL') return { label: 'LOCAL OFFLINE ● Working locally', detail: 'No internet. Devices in this restaurant still work together through the Branch Core; cash and card only.', tone: 'local' };
  return {
    label: 'LOCAL OFFLINE ● Working locally',
    detail: stats.pendingCount > 0 ? `No connection to a server. ${stats.pendingCount} change(s) are saved on this device and will send automatically.` : 'No connection to a server. This device keeps working on its own data.',
    tone: 'local'
  };
}

export interface CoreProbe {
  reachable: boolean;
  ms?: number;
  branchCode?: string;
  restaurantId?: string;
  schemaVersion?: number;
  tls?: boolean;
  error?: string;
}

/** Normalises what a person typed ("192.168.1.10", "192.168.1.10:5178", full URL) into a base URL, or null if unusable. */
export function normaliseCoreUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname) return null;
    if (!u.port && u.protocol === 'http:') u.port = '5178';
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/** Asks a Branch Core who it is. Answers "not reachable" instead of throwing. */
export async function probeCore(url: string, timeoutMs = 3000, doFetch: typeof fetch = fetch, expectedRestaurantId?: string): Promise<CoreProbe> {
  const base = normaliseCoreUrl(url);
  if (!base) return { reachable: false, error: 'That is not a valid address.' };
  const start = Date.now();
  try {
    const res = await doFetch(`${base}/discover`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { reachable: false, error: `The device at that address answered ${res.status}.` };
    const info = (await res.json()) as { service?: string; branchCode?: string; restaurantId?: string; schemaVersion?: number; tls?: boolean };
    if (info.service !== 'jamanvaar-branch-core') return { reachable: false, error: 'Something answered, but it is not a JAMANVAAR Branch Core.' };
    // A rogue machine (or a neighbour's core) must not be adopted: when this device knows its own restaurant, the core must be that restaurant's.
    if (expectedRestaurantId && info.restaurantId !== expectedRestaurantId) return { reachable: false, error: 'That Branch Core belongs to a different restaurant, so this device will not connect to it.' };
    return { reachable: true, ms: Date.now() - start, branchCode: info.branchCode, schemaVersion: info.schemaVersion, tls: info.tls };
  } catch {
    return { reachable: false, error: 'Could not reach it. Check the address and that this device is on the restaurant network.' };
  }
}

/** Saves the Branch Core address only if a core actually answers there (or clears it when empty). */
export async function saveCoreUrl(input: string, doFetch: typeof fetch = fetch, expectedRestaurantId: string | undefined = DeviceGate.getState().restaurantId): Promise<{ saved: boolean; message: string }> {
  if (!input.trim()) {
    EndpointResolver.setCoreUrl(null);
    return { saved: true, message: 'Branch Core removed. This device now talks to the cloud only.' };
  }
  const probe = await probeCore(input, 3000, doFetch, expectedRestaurantId);
  if (!probe.reachable) return { saved: false, message: probe.error ?? 'Could not reach it.' };
  EndpointResolver.setCoreUrl(normaliseCoreUrl(input));
  return { saved: true, message: `Connected to the Branch Core for branch ${probe.branchCode ?? ''}`.trim() };
}

/** "Sync now": send everything waiting and fetch anything new. Never throws; reports what happened. */
export async function syncNow(): Promise<{ ok: boolean; message: string }> {
  try {
    const pushed = await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    await SyncOutboxEngine.catchUpFromCloud();
    const left = SyncOutboxEngine.getSyncStats();
    if (left.failedCount + left.deadLetterCount > 0) return { ok: false, message: `${left.failedCount + left.deadLetterCount} change(s) still could not be sent. They are safe on this device.` };
    return { ok: true, message: (pushed as { failed?: number }).failed ? 'Some changes are waiting for a connection.' : 'Everything is up to date.' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Sync failed' };
  }
}

export interface Diagnostics {
  status: ConnectionStatus;
  mode: string;
  coreUrl: string | null;
  internetVerified: boolean;
  pending: number;
  failed: number;
  deadLetter: number;
  storage: { ok: boolean; error: string | null };
  appVersion: string;
  orders: number;
}

export function collectDiagnostics(appVersion: string): Diagnostics {
  const stats = SyncOutboxEngine.getSyncStats();
  const health = db.getPersistenceHealth();
  return {
    status: connectionStatus(),
    mode: EndpointResolver.mode(),
    coreUrl: EndpointResolver.getCoreUrl(),
    internetVerified: EndpointResolver.internetVerified(),
    pending: stats.pendingCount,
    failed: stats.failedCount,
    deadLetter: stats.deadLetterCount,
    storage: { ok: health.ok, error: health.error ?? null },
    appVersion,
    orders: db.orders.length
  };
}
