import { KeyValueStore } from '@jamanvaar/database';
import { stopRealtime } from '@jamanvaar/sync';
import { fetchWithDeadline, withSessionLock } from '@jamanvaar/api';
/**
 * Captain's only connection to cloud/api — owner-issued login id + password,
 * not a separate activation code (mirrors pos-admin's cloudLogin/cloudActivateDevice
 * two-step: cloud/api's /tenant-auth/login always requires a Welcome Kit
 * activation key the first time any given physical device connects, then
 * remembers this device's token for every login after that). Day-to-day
 * staff auth stays the fast local PIN keypad in App.tsx — this only runs
 * once per tablet.
 */

import { refreshAiConfigIfStale, reportAiQuery } from '@jamanvaar/business';
import type {
  OrderSyncPushEvent,
  OrderSyncPushResult,
  CloudSyncedOrder,
  EntitySyncEvent,
  EntitySyncPushResult,
  CloudSyncedEntity
} from '@jamanvaar/sync';

import { DeviceGate, sendHeartbeat, pullRestaurantIdentity, orderSyncPullQuery, EndpointResolver, getDevicePublicKeyJwk } from '@jamanvaar/sync';
import { MenuRepository, RestaurantIdentityRepository, TenantIsolation } from '@jamanvaar/database';

const API_BASE = import.meta.env.VITE_CLOUD_API_BASE_URL ?? 'http://localhost:4000';
// Operational traffic goes to the restaurant's Branch Core when one is configured and reachable; the cloud otherwise.
EndpointResolver.setTransport((url, init) => DeviceGate.gatedFetch(url, init));
EndpointResolver.configure({ cloudBase: API_BASE, coreUrl: import.meta.env.VITE_BRANCH_CORE_URL });

const RESTAURANT_ID_KEY = 'jamanvaar_captain_restaurant_id';
const DEVICE_LABEL_KEY = 'jamanvaar_captain_device_label';
const DEVICE_ID_KEY = 'jamanvaar_captain_device_id';
const DEVICE_TOKEN_KEY = 'jamanvaar_captain_device_token';

export class CloudApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

async function parseJsonResponse(res: Response): Promise<any> {
  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await res.json() : undefined;
  if (data && typeof data === 'object' && !Array.isArray(data)) data.serverKey = EndpointResolver.responderFor(res);
  return data;
}

export function isDeviceConnected(): boolean {
  try {
    return localStorage.getItem(RESTAURANT_ID_KEY) !== null;
  } catch {
    return false;
  }
}

export function getConnectedDeviceLabel(): string | null {
  try {
    return localStorage.getItem(DEVICE_LABEL_KEY);
  } catch {
    return null;
  }
}

/**
 * Unbinds this terminal (BUG-145 follow-up): a device the cloud no longer recognises, or has revoked, was
 * stuck forever behind the lock screen with no way back to activation, since `isDeviceConnected()` (and so
 * the whole connect screen) is gated on `RESTAURANT_ID_KEY`, not the device token. Clearing it, along with
 * the device id/token and label, is what actually returns this tablet to the connect/activation screen.
 */
export function resetTerminal(): void {
  stopRealtime();
  try {
    localStorage.removeItem(RESTAURANT_ID_KEY);
    localStorage.removeItem(DEVICE_LABEL_KEY);
    localStorage.removeItem(DEVICE_ID_KEY);
    localStorage.removeItem(DEVICE_TOKEN_KEY);
  } catch {
    // Storage unavailable - nothing to clear, but the gate reset below still lets a reload retry cleanly.
  }
  DeviceGate.reset();
}

function getStoredDeviceId(): string | null {
  try {
    return localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    return null;
  }
}

function getCaptainDeviceToken(): string | null {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY);
  } catch {
    return null;
  }
}

function persistConnection(restaurantId: string, label: string, deviceId?: string, deviceToken?: string, restaurantName?: string) {
  try {
    TenantIsolation.enter(restaurantId); // a different restaurant's local data is never carried over
    localStorage.setItem(RESTAURANT_ID_KEY, restaurantId);
    localStorage.setItem(DEVICE_LABEL_KEY, label);
    if (deviceId) localStorage.setItem(DEVICE_ID_KEY, deviceId);
    if (deviceToken) localStorage.setItem(DEVICE_TOKEN_KEY, deviceToken);
    DeviceGate.reportSuccess(); // a fresh activation starts unlocked
    MenuRepository.startFreshMenu(); // BUG-013: a real restaurant starts with no menu until one is uploaded
    RestaurantIdentityRepository.startFreshOperations(); // BUG-115: ...and no demo combos, coupons, offers or tables
    // BUG-021: this device used to keep showing the seeded "JAMANVAAR RESTAURANT" placeholder
    // forever, even after activating against a real restaurant with a different name.
    RestaurantIdentityRepository.adopt(restaurantId, { name: restaurantName });
  } catch {
    // Storage unavailable — connection won't persist across reloads, but this run keeps working.
  }
}

/**
 * Activates this tablet with the one activation key from the Super Admin Welcome Kit, the same way the POS and Kitchen Display do:
 * the key alone identifies the restaurant, so nothing else is asked.
 */
export async function activateCaptainWithKey(code: string): Promise<void> {
  // Generated (or loaded, if this profile already has one) before the request, so the server can bind the device
  // to it from the very first activation — see @jamanvaar/sync's device_identity.ts.
  const publicKeyJwk = await getDevicePublicKeyJwk('CAPTAIN').catch(() => null);
  const res = await fetchWithDeadline(`${API_BASE}/api/v1/activation/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim(), deviceType: 'CAPTAIN', appVersion: '1.0.0', ...(publicKeyJwk ? { publicKeyJwk } : {}) })
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Activation failed (${res.status})`, res.status);
  }
  KeyValueStore.set('jamanvaar_bound_branch_id', data.device?.branchId ?? '');
  persistConnection(data.restaurantId, data.device?.name ?? 'Captain Tablet', data.device?.id, data.deviceToken, data.restaurant?.name);
}

export function deviceFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getCaptainDeviceToken();
  if (!token) return Promise.reject(new CloudApiError('Device not activated', 401));
  return EndpointResolver.fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) }
  });
}

export async function pushOrderSync(
  events: OrderSyncPushEvent[]
): Promise<{ results: OrderSyncPushResult[]; serverTime: string }> {
  const res = await deviceFetch('/api/v1/orders/sync', {
    method: 'POST',
    body: JSON.stringify({ events })
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Order sync push failed (${res.status})`, res.status);
  }
  return data;
}

export async function pullOrderSync(cursor?: string): Promise<{ orders: CloudSyncedOrder[]; serverTime: string; latestSeq?: number; hasMore?: boolean; serverKey?: 'cloud' | 'core' }> {
  const query = orderSyncPullQuery(cursor);
  const res = await deviceFetch(`/api/v1/orders/sync${query}`);
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Order sync pull failed (${res.status})`, res.status);
  }
  return data;
}

export async function pushEntitySync(
  entityType: string,
  events: EntitySyncEvent[]
): Promise<{ results: EntitySyncPushResult[]; serverTime: string }> {
  const res = await deviceFetch(`/api/v1/entity-sync/${entityType}`, {
    method: 'POST',
    body: JSON.stringify({ events })
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Entity sync push failed (${res.status})`, res.status);
  }
  return data;
}

export async function pullEntitySync(
  entityType: string,
  since?: string
): Promise<{ entities: CloudSyncedEntity[]; serverTime: string; latestSeq?: number; hasMore?: boolean; serverKey?: 'cloud' | 'core' }> {
  const query = since?.startsWith('seq:') ? `?afterSeq=${encodeURIComponent(since.slice(4))}` : since ? `?since=${encodeURIComponent(since)}` : '?afterSeq=0';
  const res = await deviceFetch(`/api/v1/entity-sync/${entityType}${query}`);
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Entity sync pull failed (${res.status})`, res.status);
  }
  return data;
}

export async function reportHeartbeat(): Promise<void> {
  const deviceToken = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (!deviceToken) return;
  // The platform's decision about JAMAN AI for this restaurant rides on the heartbeat (cached 5 minutes).
  void refreshAiConfigIfStale({ apiBase: API_BASE, deviceToken });
  // Real version (from package.json at build time), OS and sync backlog; also applies the answer: lock,
  // notice, update offer and any signed offline extension.
  await sendHeartbeat({
    apiBase: API_BASE,
    deviceToken,
    appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0',
    restaurantId: localStorage.getItem(RESTAURANT_ID_KEY),
    deviceId: localStorage.getItem(DEVICE_ID_KEY)
  });
}

/** B2-054: picks up a restaurant-identity edit made on another device (or by Super Admin). */
export async function syncRestaurantIdentity(): Promise<void> {
  const deviceToken = localStorage.getItem(DEVICE_TOKEN_KEY);
  const restaurantId = localStorage.getItem(RESTAURANT_ID_KEY);
  if (!deviceToken || !restaurantId) return;
  await pullRestaurantIdentity({ apiBase: API_BASE, deviceToken, restaurantId });
}

/** Tell the cloud a JAMAN AI question was answered (usage + measured latency) and honour its daily limit. */
export async function reportAiQueryNow(intent: string, latencyMs: number): Promise<void> {
  const deviceToken = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (!deviceToken) return;
  await reportAiQuery({ apiBase: API_BASE, deviceToken, intent, latencyMs });
}

/** Reserves a block of human order/KOT numbers for this device so offline terminals never issue the same number. */
export async function leaseNumberBlock(kind: 'ORDER' | 'KOT', count: number): Promise<{ kind: 'ORDER' | 'KOT'; prefix: string; businessDate: string; start: number; count: number }> {
  const res = await deviceFetch('/api/v1/sync/number-leases', { method: 'POST', body: JSON.stringify({ kind, count }) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.message) || `Number lease failed (${res.status})`);
  return data;
}
