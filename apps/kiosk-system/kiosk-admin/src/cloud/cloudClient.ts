/**
 * Kiosk Admin's only connection to cloud/api — a one-time device
 * provisioning step, not a replacement for the existing local admin-
 * credential login in App.tsx. Once connected, this terminal is a real
 * KIOSK_ADMIN Device row in cloud/api (gated on the restaurant's actual
 * application entitlements — see ApplicationEntitlementsService in
 * cloud/api), so it actually counts toward the Super Admin Applications
 * page's device totals instead of the permanently-zero count that page
 * showed before (there was previously no DeviceType value, and no client
 * anywhere, for Kiosk Admin at all).
 *
 * Two calls, not one, because a real Device row requires an activation key
 * — the same flow POS Admin/POS/Captain/KDS already go through
 * (tenant-auth login -> ACTIVATION_REQUIRED -> activate-device). Captain's
 * simpler one-step connectDevice() (apps/restaurant-system/captain/src/
 * cloud/cloudClient.ts) intentionally skips this by sending no deviceType
 * at all, which authenticates the owner directly but never creates a
 * Device row — fine for Captain's original "just get me in" use case, but
 * wrong to copy here: the whole point of this file is to make Kiosk Admin
 * devices real and countable, which only the activation path delivers.
 */

const API_BASE = import.meta.env.VITE_CLOUD_API_BASE_URL ?? 'http://localhost:4000';

const RESTAURANT_ID_KEY = 'jamanvaar_kiosk_admin_restaurant_id';
const DEVICE_LABEL_KEY = 'jamanvaar_kiosk_admin_device_label';
const DEVICE_TOKEN_KEY = 'jamanvaar_kiosk_admin_device_token';

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

async function parseJsonResponse(res: Response): Promise<any> {
  const contentType = res.headers.get('content-type') ?? '';
  return contentType.includes('application/json') ? res.json() : undefined;
}

export interface ConnectStepResult {
  /** Already-activated device on this terminal — connected, no key needed. */
  status: 'CONNECTED';
}

export interface ActivationRequiredResult {
  /** First-time connect — the terminal must supply an activation key next. */
  status: 'ACTIVATION_REQUIRED';
  activationSessionToken: string;
  restaurantName: string;
}

/**
 * Step 1: authenticate as the restaurant owner/staff who generated this
 * terminal's credential, identifying this attempt as a KIOSK_ADMIN device.
 * A brand-new terminal always comes back ACTIVATION_REQUIRED — cloud/api's
 * tenant-auth login only returns CONNECTED for a deviceId it already
 * recognizes, and this terminal doesn't have one yet.
 */
export async function connectDeviceStep1(
  restaurantId: string,
  email: string,
  password: string
): Promise<ConnectStepResult | ActivationRequiredResult> {
  const res = await fetch(`${API_BASE}/api/v1/tenant-auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurantId: restaurantId.trim(),
      email: email.trim(),
      password,
      deviceType: 'KIOSK_ADMIN'
    })
  });

  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Connection failed (${res.status})`, res.status);
  }

  if (data?.status === 'ACTIVATION_REQUIRED') {
    return {
      status: 'ACTIVATION_REQUIRED',
      activationSessionToken: data.activationSessionToken,
      restaurantName: data.restaurant?.name ?? restaurantId.trim()
    };
  }

  // LOGIN_SUCCESS on the very first call means this restaurant/email
  // combination already has an active, non-device-scoped session type —
  // treat it the same as connected rather than erroring.
  persistConnection(restaurantId, data?.user?.fullName ?? email.trim());
  return { status: 'CONNECTED' };
}

/**
 * Step 2: redeem the Super Admin-issued activation key using the session
 * token from step 1. This is what actually creates the KIOSK_ADMIN Device
 * row — everything downstream (Super Admin's Applications tab, device
 * heartbeat, revoke/deactivate) depends on this row existing.
 */
export async function connectDeviceStep2(
  activationSessionToken: string,
  activationKey: string,
  restaurantId: string,
  ownerLabel: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/tenant-auth/activate-device`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      activationSessionToken,
      activationKey: activationKey.trim(),
      deviceType: 'KIOSK_ADMIN',
      deviceName: 'Kiosk Admin Terminal'
    })
  });

  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Activation failed (${res.status})`, res.status);
  }

  persistConnection(restaurantId, ownerLabel);
  try {
    if (data?.deviceToken) localStorage.setItem(DEVICE_TOKEN_KEY, data.deviceToken);
  } catch {
    // Storage unavailable — the device is still activated server-side, this terminal just won't remember its own token across reloads.
  }
}

function persistConnection(restaurantId: string, label: string): void {
  try {
    localStorage.setItem(RESTAURANT_ID_KEY, restaurantId.trim());
    localStorage.setItem(DEVICE_LABEL_KEY, label);
  } catch {
    // Storage unavailable — connection won't persist across reloads, but this run keeps working.
  }
}
