/**
 * KDS's only connection to cloud/api. Same pattern as pos/src/cloud/cloudClient.ts:
 * a single activation-key redeem call gets a device token, used as a Bearer
 * credential for every request after that. KDS mostly pulls (it needs to see
 * orders created elsewhere), but pushes too — a chef marking a ticket READY
 * on this terminal needs to reach POS/Captain the same way an order reaching
 * this terminal does.
 */

import type { OrderSyncPushEvent, OrderSyncPushResult, CloudSyncedOrder, EntitySyncEvent, EntitySyncPushResult, CloudSyncedEntity } from '@jamanvaar/sync';

import { DeviceGate, sendHeartbeat, pullRestaurantIdentity } from '@jamanvaar/sync';
import { MenuRepository, RestaurantIdentityRepository } from '@jamanvaar/database';

const API_BASE = import.meta.env.VITE_CLOUD_API_BASE_URL ?? 'http://localhost:4000';

const RESTAURANT_ID_KEY = 'jamanvaar_kds_restaurant_id';
const DEVICE_ID_KEY = 'jamanvaar_kds_device_id';
const DEVICE_TOKEN_KEY = 'jamanvaar_kds_device_token';

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

export function isKdsDeviceConnected(): boolean {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY) !== null;
  } catch {
    return false;
  }
}

function getKdsDeviceToken(): string | null {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function activateKdsDevice(code: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/activation/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim(), deviceType: 'KDS', appVersion: '1.0.0' })
  });

  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Activation failed (${res.status})`, res.status);
  }

  try {
    localStorage.setItem(RESTAURANT_ID_KEY, data.restaurantId);
    // BUG-021: this device used to keep showing the seeded "JAMANVAAR RESTAURANT" placeholder
    // forever, even after activating against a real restaurant with a different name.
    if (data.restaurant) {
      RestaurantIdentityRepository.adopt(data.restaurantId, data.restaurant);
    }
    localStorage.setItem(DEVICE_ID_KEY, data.device.id);
    localStorage.setItem(DEVICE_TOKEN_KEY, data.deviceToken);
    DeviceGate.reportSuccess(); // a fresh activation starts unlocked
    MenuRepository.startFreshMenu(); // BUG-013: a real restaurant starts with no menu until one is uploaded
    RestaurantIdentityRepository.startFreshOperations(); // BUG-115: ...and no demo combos, coupons, offers or tables
  } catch {
    // Storage unavailable — activation succeeded server-side, this terminal just won't remember it across reloads.
  }
}

function deviceFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getKdsDeviceToken();
  if (!token) return Promise.reject(new CloudApiError('Device not activated', 401));
  return DeviceGate.gatedFetch(`${API_BASE}${path}`, {
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

/** BUG-019/034/035: pulls whatever another device pushed (currently just staff, from Restaurant Admin). */
export async function pushEntitySync(entityType: string, events: EntitySyncEvent[]): Promise<{ results: EntitySyncPushResult[]; serverTime: string }> {
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

export async function pullEntitySync(entityType: string, since?: string): Promise<{ entities: CloudSyncedEntity[]; serverTime: string }> {
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
