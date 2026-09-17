/**
 * KDS's only connection to cloud/api. Same pattern as pos/src/cloud/cloudClient.ts:
 * a single activation-key redeem call gets a device token, used as a Bearer
 * credential for every request after that. KDS mostly pulls (it needs to see
 * orders created elsewhere), but pushes too — a chef marking a ticket READY
 * on this terminal needs to reach POS/Captain the same way an order reaching
 * this terminal does.
 */

import type { OrderSyncPushEvent, OrderSyncPushResult, CloudSyncedOrder } from '@jamanvaar/sync';

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
    localStorage.setItem(DEVICE_ID_KEY, data.device.id);
    localStorage.setItem(DEVICE_TOKEN_KEY, data.deviceToken);
  } catch {
    // Storage unavailable — activation succeeded server-side, this terminal just won't remember it across reloads.
  }
}

function deviceFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getKdsDeviceToken();
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
