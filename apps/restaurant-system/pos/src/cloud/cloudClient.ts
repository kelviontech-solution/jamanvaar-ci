import { KeyValueStore } from '@jamanvaar/database';
import { stopRealtime } from '@jamanvaar/sync';
import { StaffSession } from '@jamanvaar/sync';
import { fetchWithDeadline, withSessionLock } from '@jamanvaar/api';
/**
 * POS's only connection to cloud/api. Single-call activation, same pattern
 * as kiosk-user's Phase 3 cloudClient.ts: the activation-key redeem
 * response's own deviceToken is used directly, no second login step.
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

import { DeviceGate, sendHeartbeat, pullRestaurantIdentity, orderSyncPullQuery, EndpointResolver, getDevicePublicKeyJwk, signDeviceRequest } from '@jamanvaar/sync';
import { MenuRepository, PrinterRepository, InventoryRepository, RestaurantIdentityRepository, TenantIsolation } from '@jamanvaar/database';

const API_BASE = import.meta.env.VITE_CLOUD_API_BASE_URL ?? 'http://localhost:4000';
// Operational traffic goes to the restaurant's Branch Core when one is configured and reachable; the cloud otherwise.
EndpointResolver.setTransport((url, init) => DeviceGate.gatedFetch(url, init));
EndpointResolver.configure({ cloudBase: API_BASE, coreUrl: import.meta.env.VITE_BRANCH_CORE_URL });

const RESTAURANT_ID_KEY = 'jamanvaar_pos_restaurant_id';
const DEVICE_ID_KEY = 'jamanvaar_pos_device_id';
const DEVICE_TOKEN_KEY = 'jamanvaar_pos_device_token';

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

export function isPosDeviceConnected(): boolean {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY) !== null;
  } catch {
    return false;
  }
}

export function getPosDeviceToken(): string | null {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getPosRestaurantId(): string | null {
  try {
    return localStorage.getItem(RESTAURANT_ID_KEY);
  } catch {
    return null;
  }
}

/**
 * Unbinds this terminal (BUG-145 follow-up): a device the cloud no longer recognises, or has revoked, was
 * stuck forever behind the lock screen with no way back to activation. Clears the saved restaurant id and
 * device credential and forgets the lock state, so the app falls back to asking for a fresh activation key.
 */
export function resetTerminal(): void {
  stopRealtime();
  try {
    localStorage.removeItem(RESTAURANT_ID_KEY);
    localStorage.removeItem(DEVICE_ID_KEY);
    localStorage.removeItem(DEVICE_TOKEN_KEY);
  } catch {
    // Storage unavailable - nothing to clear, but the gate reset below still lets a reload retry cleanly.
  }
  DeviceGate.reset();
}

export async function activatePosDevice(code: string): Promise<void> {
  // Generated (or loaded, if this profile already has one) before the request, so the server can bind the device
  // to it from the very first activation — see @jamanvaar/sync's device_identity.ts.
  const publicKeyJwk = await getDevicePublicKeyJwk('POS').catch(() => null);
  const res = await fetchWithDeadline(`${API_BASE}/api/v1/activation/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim(), deviceType: 'POS', appVersion: '1.0.0', ...(publicKeyJwk ? { publicKeyJwk } : {}) })
  });

  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Activation failed (${res.status})`, res.status);
  }

  try {
    TenantIsolation.enter(data.restaurantId);
    KeyValueStore.set('jamanvaar_bound_branch_id', data.device?.branchId ?? ''); // a different restaurant's local data is never carried over
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
    PrinterRepository.startFresh(); // BUG-025: ...and no printers until real ones are added
    InventoryRepository.startFresh(); // BUG-045: ...and no demo ingredients/stock
  } catch {
    // Storage unavailable — activation succeeded server-side, this terminal
    // just won't remember it across reloads.
  }
}

export function deviceFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getPosDeviceToken();
  if (!token) return Promise.reject(new CloudApiError('Device not activated', 401));
  return EndpointResolver.fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) }
  });
}

/** Like deviceFetch, but also signs the request with this terminal's device-bound key, for payment routes. */
async function signedDeviceFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getPosDeviceToken();
  if (!token) return Promise.reject(new CloudApiError('Device not activated', 401));
  const method = (init.method ?? 'GET').toUpperCase();
  const body = typeof init.body === 'string' ? init.body : '';
  const signed = await signDeviceRequest('POS', method, path, body).catch((err) => {
    console.error('Could not sign device request; sending unsigned:', err);
    return null;
  });
  return EndpointResolver.fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(signed ? { 'x-device-signature': signed.signature, 'x-device-timestamp': signed.timestamp } : {}),
      ...(init.headers ?? {})
    }
  });
}

export async function getPaymentStatus(paymentId: string): Promise<{ status: string; orderStatus: string }> {
  const res = await signedDeviceFetch(`/api/v1/payments/${paymentId}/status`);
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Payment status check failed (${res.status})`, res.status);
  }
  return data;
}

export async function createRefund(paymentId: string, amountPaise: number, reason: string, requestedBy: string, idempotencyKey?: string): Promise<{ refundId: string; providerRefundId: string; status: string; amount: number }> {
  const scope = StaffSession.approvalScope();
  const key = idempotencyKey ?? (scope?.paymentId === paymentId && scope.amountPaise === amountPaise ? scope.idempotencyKey : crypto.randomUUID());
  const res = await signedDeviceFetch(`/api/v1/payments/${paymentId}/refund`, {
    method: 'POST',
    body: JSON.stringify({ amountPaise, reason, requestedBy, staffSession: StaffSession.sessionToken(), approvalSession: StaffSession.approvalToken(), idempotencyKey: key })
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Refund failed (${res.status})`, res.status);
  }
  return data;
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

export async function sendReceipt(
  channel: 'WHATSAPP' | 'SMS',
  phoneNumber: string,
  templateParams: string[]
): Promise<{ success: boolean; providerMessageId?: string; errorMessage?: string }> {
  const res = await deviceFetch('/api/v1/receipts/send', {
    method: 'POST',
    body: JSON.stringify({ channel, phoneNumber, templateParams })
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Receipt send failed (${res.status})`, res.status);
  }
  return data;
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

export async function pushInventoryMovements(movements: import('@jamanvaar/sync').PushedMovement[]): Promise<{ results: Array<{ movementId: string; status: 'ok' | 'error'; duplicate?: boolean; error?: string }> }> {
  const res = await deviceFetch('/api/v1/inventory/movements', { method: 'POST', body: JSON.stringify({ movements }) });
  const data = await parseJsonResponse(res);
  if (!res.ok) throw new CloudApiError(data?.message ?? 'Stock movement sync failed', res.status);
  return data;
}

export async function pullInventoryMovements(afterSeq: number): Promise<{ movements: import('@jamanvaar/sync').RemoteMovement[]; latestSeq: number; hasMore: boolean; serverKey?: 'cloud' | 'core' }> {
  const res = await deviceFetch(`/api/v1/inventory/movements?afterSeq=${afterSeq}`);
  const data = await parseJsonResponse(res);
  if (!res.ok) throw new CloudApiError(data?.message ?? 'Stock ledger recovery failed', res.status);
  return data;
}
