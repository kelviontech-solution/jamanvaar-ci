/**
 * kiosk-user's only connection to cloud/api. Unlike every other app in this
 * monorepo's activation flow, this one is deliberately a single call: a
 * walk-up customer kiosk has no staff credentials to layer a login step on
 * top of, so the activation-key redeem response's own deviceToken (which
 * cloud/api's activation-keys.service.ts already returns, unused by any
 * other app's frontend) is used directly.
 */

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
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) }
  });
}

// --- Order sync bridge (POS/KDS/Captain/Kiosk share this endpoint) ---

import type { OrderSyncPushEvent, OrderSyncPushResult, CloudSyncedOrder } from '@jamanvaar/sync';

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
