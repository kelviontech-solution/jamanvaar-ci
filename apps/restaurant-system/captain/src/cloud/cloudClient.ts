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

import { DeviceGate, sendHeartbeat, pullRestaurantIdentity, orderSyncPullQuery, EndpointResolver } from '@jamanvaar/sync';
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
  return contentType.includes('application/json') ? res.json() : undefined;
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
 * Step 1: the id + password the restaurant owner generated for this tablet
 * (see CloudDeviceLoginsPanel in pos-admin). A device this restaurant has
 * never seen before comes back ACTIVATION_REQUIRED — caller must then call
 * activateCaptainDevice() with a Welcome Kit key before this tablet has a
 * device token.
 */
export async function connectDevice(
  restaurantId: string,
  email: string,
  password: string
): Promise<{ requiresActivation: boolean; activationSessionToken?: string }> {
  const res = await fetch(`${API_BASE}/api/v1/tenant-auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurantId: restaurantId.trim(),
      email: email.trim(),
      password,
      deviceType: 'CAPTAIN',
      deviceId: getStoredDeviceId() ?? undefined,
      deviceToken: getCaptainDeviceToken() ?? undefined
    })
  });

  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Connection failed (${res.status})`, res.status);
  }

  if (data.status === 'ACTIVATION_REQUIRED') {
    return { requiresActivation: true, activationSessionToken: data.activationSessionToken };
  }

  persistConnection(data.restaurant.id, data.user?.fullName ?? email.trim(), data.deviceId, data.deviceToken, data.restaurant.name);
  return { requiresActivation: false };
}

/** Step 2, only on a tablet's first-ever connect: redeems the Welcome Kit activation key and mints this device's token. */
export async function activateCaptainDevice(activationSessionToken: string, activationKey: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/tenant-auth/activate-device`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      activationSessionToken,
      activationKey: activationKey.trim(),
      deviceType: 'CAPTAIN',
      deviceName: 'Captain Tablet'
    })
  });

  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Activation failed (${res.status})`, res.status);
  }

  persistConnection(data.restaurant.id, data.user?.fullName ?? 'Captain Tablet', data.deviceId, data.deviceToken, data.restaurant.name);
}

function deviceFetch(path: string, init: RequestInit = {}): Promise<Response> {
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

export async function pullOrderSync(cursor?: string): Promise<{ orders: CloudSyncedOrder[]; serverTime: string; latestSeq?: number; hasMore?: boolean }> {
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
): Promise<{ entities: CloudSyncedEntity[]; serverTime: string }> {
  const query = since ? `?since=${encodeURIComponent(since)}` : '';
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
