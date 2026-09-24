/**
 * A guest's own phone talking to the public, tokenless `/api/v1/qr-guest/*` endpoints (BUG-119).
 *
 * Deliberately separate from cloudClient.ts: everything in that file assumes an activated device
 * (a device token) or a signed-in owner (a session cookie/access token). A guest scanning a table
 * QR has neither — the token printed on the QR code IS the entire security boundary, checked
 * server-side against QrTableLink. This client sends nothing else: no device token, no credentials,
 * no session cookie.
 */

const API_BASE = import.meta.env.VITE_CLOUD_API_BASE_URL ?? 'http://localhost:4000';

export class QrGuestApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export interface QrGuestModifierOption {
  id: string;
  name: string;
  priceDelta: number; // paise, as priced server-side
}

export interface QrGuestModifierGroup {
  id: string;
  name: string;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  options: QrGuestModifierOption[];
}

export interface QrGuestMenuItem {
  externalItemId: string;
  name: string;
  description?: string;
  categoryId: string;
  price: number; // rupees, for display
  imageUrl?: string;
  dietaryType?: string;
  isAvailable: boolean;
  modifierGroupIds: string[];
}

export interface QrGuestSession {
  restaurant: { name: string };
  table: { tableNumber: string; capacity?: number };
  categories: Array<{ id: string; name: string; sortOrder: number }>;
  items: QrGuestMenuItem[];
  modifierGroups: QrGuestModifierGroup[];
}

export interface QrGuestOrderLine {
  externalItemId: string;
  quantity: number;
  selectedOptionIds: string[];
  specialInstructions?: string;
}

export interface QrGuestOrderConfirmation {
  externalOrderId: string;
  tokenNumber: string;
  totalAmount: number; // rupees
  status: string;
}

export interface QrGuestOrderStatus {
  status: string;
  tokenNumber: string | null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) }
    });
  } catch {
    throw new QrGuestApiError('Could not reach the restaurant right now. Please check your internet connection and try again.', 0);
  }

  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await res.json().catch(() => undefined) : undefined;

  if (!res.ok) {
    const issues = Array.isArray(data?.issues)
      ? (data.issues as Array<{ message?: string }>).map((i) => i.message).filter(Boolean).join(' ')
      : '';
    throw new QrGuestApiError(issues || data?.message || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

export function fetchQrGuestSession(token: string): Promise<QrGuestSession> {
  return request<QrGuestSession>(`/api/v1/qr-guest/session?token=${encodeURIComponent(token)}`);
}

export function placeQrGuestOrder(payload: {
  token: string;
  items: QrGuestOrderLine[];
  customerName?: string;
  customerPhone?: string;
  orderNotes?: string;
  idempotencyKey: string;
}): Promise<QrGuestOrderConfirmation> {
  return request<QrGuestOrderConfirmation>('/api/v1/qr-guest/orders', {
    method: 'POST',
    body: JSON.stringify({ ...payload, paymentMethod: 'CASH_AT_COUNTER' })
  });
}

export function fetchQrGuestOrderStatus(externalOrderId: string, token: string): Promise<QrGuestOrderStatus> {
  return request<QrGuestOrderStatus>(
    `/api/v1/qr-guest/orders/${encodeURIComponent(externalOrderId)}?token=${encodeURIComponent(token)}`
  );
}

/** A fresh id the guest's own browser generates once per checkout attempt, resent unchanged on a retry. */
export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `qr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
