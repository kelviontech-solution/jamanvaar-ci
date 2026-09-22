/**
 * kiosk-user's only connection to cloud/api. Unlike every other app in this
 * monorepo's activation flow, this one is deliberately a single call: a
 * walk-up customer kiosk has no staff credentials to layer a login step on
 * top of, so the activation-key redeem response's own deviceToken (which
 * cloud/api's activation-keys.service.ts already returns, unused by any
 * other app's frontend) is used directly.
 */

import { DeviceGate, sendHeartbeat } from '@jamanvaar/sync';
import { MenuRepository, PrinterRepository, RestaurantIdentityRepository } from '@jamanvaar/database';

const API_BASE = import.meta.env.VITE_CLOUD_API_BASE_URL ?? 'http://localhost:4000';

const RESTAURANT_ID_KEY = 'jamanvaar_kiosk_user_restaurant_id';
const DEVICE_ID_KEY = 'jamanvaar_kiosk_user_device_id';
const DEVICE_TOKEN_KEY = 'jamanvaar_kiosk_user_device_token';

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

export function isKioskDeviceConnected(): boolean {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY) !== null;
  } catch {
    return false;
  }
}

export function getKioskDeviceToken(): string | null {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getKioskRestaurantId(): string | null {
  try {
    return localStorage.getItem(RESTAURANT_ID_KEY);
  } catch {
    return null;
  }
}

export function getKioskDeviceId(): string | null {
  try {
    return localStorage.getItem(DEVICE_ID_KEY);
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
  try {
    localStorage.removeItem(RESTAURANT_ID_KEY);
    localStorage.removeItem(DEVICE_ID_KEY);
    localStorage.removeItem(DEVICE_TOKEN_KEY);
  } catch {
    // Storage unavailable - nothing to clear, but the gate reset below still lets a reload retry cleanly.
  }
  DeviceGate.reset();
}

export interface ActivationRestaurantBranding {
  name: string;
  gstin: string | null;
  address: string | null;
}

export async function activateKioskDevice(code: string): Promise<ActivationRestaurantBranding | null> {
  const res = await fetch(`${API_BASE}/api/v1/activation/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim(), deviceType: 'KIOSK', appVersion: '1.0.0' })
  });

  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Activation failed (${res.status})`, res.status);
  }

  try {
    localStorage.setItem(RESTAURANT_ID_KEY, data.restaurantId);
    localStorage.setItem(DEVICE_ID_KEY, data.device.id);
    localStorage.setItem(DEVICE_TOKEN_KEY, data.deviceToken);
    DeviceGate.reportSuccess(); // a fresh activation starts unlocked
    MenuRepository.startFreshMenu(); // BUG-013: a real restaurant starts with no menu until one is uploaded
    RestaurantIdentityRepository.startFreshOperations(); // BUG-115: ...and no demo combos, coupons, offers or tables
    PrinterRepository.startFresh(); // BUG-025: ...and no printers until real ones are added
  } catch {
    // Storage unavailable — activation succeeded server-side, but this
    // terminal won't remember it across reloads. Caller sees no error since
    // the current session is still usable via the in-memory result.
  }

  // Real branding, so the welcome screen stops showing db.ts's local seed
  // placeholder ("My Restaurant") the moment this terminal is activated.
  return data.restaurant ?? null;
}

export function deviceFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getKioskDeviceToken();
  if (!token) return Promise.reject(new CloudApiError('Device not activated', 401));
  return DeviceGate.gatedFetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) }
  });
}

// --- Order sync bridge (POS/KDS/Captain/Kiosk share this endpoint) ---

import type { OrderSyncPushEvent, OrderSyncPushResult, CloudSyncedOrder, EntitySyncEvent, EntitySyncPushResult, CloudSyncedEntity } from '@jamanvaar/sync';

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

// BUG-016: kiosk-user had no menu sync at all — a fresh/cleared kiosk terminal fell back
// to the local seed menu instead of the restaurant's real one. Pull-only: a customer kiosk
// never edits the menu, same pattern as Captain.
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

// --- Real Cashfree Payment (Phase 3) ---

export interface PaymentOrderResult {
  orderId: string;
  paymentId: string;
  paymentSessionId: string | null;
  amount: number; // paise
  currency: string;
  status: string;
}

export interface CartLinePayload {
  externalItemId: string;
  quantity: number;
  selectedOptionIds: string[];
}

export async function createPaymentOrder(externalOrderId: string, lines: CartLinePayload[]): Promise<PaymentOrderResult> {
  const res = await deviceFetch('/api/v1/payments/orders', {
    method: 'POST',
    body: JSON.stringify({ externalOrderId, lines })
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Payment order creation failed (${res.status})`, res.status);
  }
  return data;
}

export async function getPaymentOrderStatus(paymentId: string): Promise<{ status: string; orderStatus: string }> {
  const res = await deviceFetch(`/api/v1/payments/${paymentId}/status`);
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Payment status check failed (${res.status})`, res.status);
  }
  return data;
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
