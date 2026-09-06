/**
 * Captain's only connection to cloud/api — a one-time device provisioning
 * step (owner-issued login id + password, no activation code), not a
 * replacement for the existing local PIN keypad in App.tsx. Once connected,
 * this tablet is known to Super Admin (it appears under the restaurant's
 * Owner & Users) and the app never asks again — day-to-day auth stays the
 * fast local PIN flow.
 */

const API_BASE = import.meta.env.VITE_CLOUD_API_BASE_URL ?? 'http://localhost:4000';

const RESTAURANT_ID_KEY = 'jamanvaar_captain_restaurant_id';
const DEVICE_LABEL_KEY = 'jamanvaar_captain_device_label';

export class CloudApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
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
 * One combined step: the id + password the restaurant owner generated for
 * this tablet (see CloudDeviceLoginsPanel in pos-admin) IS the connection —
 * no separate activation code. Restaurant ID is not a secret (it's shown
 * in the owner's own dashboard for exactly this purpose) so it travels
 * alongside the credential rather than through a redeemable code.
 */
export async function connectDevice(restaurantId: string, email: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/tenant-auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurantId: restaurantId.trim(), email: email.trim(), password })
  });

  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await res.json() : undefined;

  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Connection failed (${res.status})`, res.status);
  }

  try {
    localStorage.setItem(RESTAURANT_ID_KEY, restaurantId.trim());
    localStorage.setItem(DEVICE_LABEL_KEY, data?.user?.fullName ?? email.trim());
  } catch {
    // Storage unavailable — connection won't persist across reloads, but this run keeps working.
  }
}
