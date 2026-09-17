/**
 * Captain's only connection to cloud/api — owner-issued login id + password,
 * not a separate activation code (mirrors pos-admin's cloudLogin/cloudActivateDevice
 * two-step: cloud/api's /tenant-auth/login always requires a Welcome Kit
 * activation key the first time any given physical device connects, then
 * remembers this device's token for every login after that). Day-to-day
 * staff auth stays the fast local PIN keypad in App.tsx — this only runs
 * once per tablet.
 */

import type {
  OrderSyncPushEvent,
  OrderSyncPushResult,
  CloudSyncedOrder,
  EntitySyncEvent,
  EntitySyncPushResult,
  CloudSyncedEntity
} from '@jamanvaar/sync';

const API_BASE = import.meta.env.VITE_CLOUD_API_BASE_URL ?? 'http://localhost:4000';

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

function persistConnection(restaurantId: string, label: string, deviceId?: string, deviceToken?: string) {
  try {
    localStorage.setItem(RESTAURANT_ID_KEY, restaurantId);
    localStorage.setItem(DEVICE_LABEL_KEY, label);
    if (deviceId) localStorage.setItem(DEVICE_ID_KEY, deviceId);
    if (deviceToken) localStorage.setItem(DEVICE_TOKEN_KEY, deviceToken);
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

  persistConnection(data.restaurant.id, data.user?.fullName ?? email.trim(), data.deviceId, data.deviceToken);
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

  persistConnection(data.restaurant.id, data.user?.fullName ?? 'Captain Tablet', data.deviceId, data.deviceToken);
}

function deviceFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getCaptainDeviceToken();
  if (!token) return Promise.reject(new CloudApiError('Device not activated', 401));
  return fetch(`${API_BASE}${path}`, {
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

export async function pullOrderSync(since?: string): Promise<{ orders: CloudSyncedOrder[]; serverTime: string }> {
  const query = since ? `?since=${encodeURIComponent(since)}` : '';
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
  try {
    await deviceFetch('/api/v1/devices/me/heartbeat', {
      method: 'PATCH',
      body: JSON.stringify({ syncStatus: 'ok', appVersion: '1.0.0' })
    });
  } catch {
    // Best-effort — a missed heartbeat just means this device shows stale
    // "last seen" in Super Admin until the next successful one.
  }
}
