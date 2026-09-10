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

// --- Staff Session Layer (Task 2) ---

const TENANT_REFRESH_TOKEN_KEY = 'jamanvaar_kiosk_admin_tenant_refresh';
const TENANT_USER_KEY = 'jamanvaar_kiosk_admin_tenant_user';

/** In-memory only — a 15-minute-lived access token has no business surviving a reload. */
let tenantAccessToken: string | null = null;
let silentRefreshTimer: ReturnType<typeof setInterval> | null = null;

export function getConnectedRestaurantId(): string | null {
  try {
    return localStorage.getItem(RESTAURANT_ID_KEY);
  } catch {
    return null;
  }
}

export interface StaffUser {
  fullName: string;
  role: string;
}

function persistTenantSession(refreshToken: string, user: StaffUser): void {
  try {
    localStorage.setItem(TENANT_REFRESH_TOKEN_KEY, refreshToken);
    localStorage.setItem(TENANT_USER_KEY, JSON.stringify(user));
  } catch {
    // Storage unavailable — this run keeps working, but won't survive a reload.
  }
}

function clearTenantSession(): void {
  tenantAccessToken = null;
  try {
    localStorage.removeItem(TENANT_REFRESH_TOKEN_KEY);
    localStorage.removeItem(TENANT_USER_KEY);
  } catch {
    // Storage unavailable — nothing to clean up.
  }
}

export function getTenantAccessToken(): string | null {
  return tenantAccessToken;
}

export function isStaffLoggedIn(): boolean {
  try {
    return localStorage.getItem(TENANT_REFRESH_TOKEN_KEY) !== null;
  } catch {
    return false;
  }
}

export function getStaffUser(): StaffUser | null {
  try {
    const raw = localStorage.getItem(TENANT_USER_KEY);
    return raw ? (JSON.parse(raw) as StaffUser) : null;
  } catch {
    return null;
  }
}

/**
 * Real OWNER/MANAGER login — separate from and unrelated to
 * connectDeviceStep1/2's one-time device-activation flow above. Uses
 * tenant-auth's "direct" login path (no deviceType/deviceId), which returns
 * session tokens without touching device-activation state at all.
 */
export async function staffLogin(restaurantId: string, email: string, password: string): Promise<StaffUser> {
  const res = await fetch(`${API_BASE}/api/v1/tenant-auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurantId,
      email: email.trim(),
      password,
      returnRefreshToken: true,
      adminOnly: true
    })
  });

  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Login failed (${res.status})`, res.status);
  }

  tenantAccessToken = data.accessToken;
  const user: StaffUser = { fullName: data.user.fullName, role: data.user.role };
  persistTenantSession(data.refreshToken, user);
  startSilentRefresh();
  return user;
}

export async function staffLogout(): Promise<void> {
  const refreshToken = (() => {
    try {
      return localStorage.getItem(TENANT_REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  })();

  stopSilentRefresh();

  if (tenantAccessToken && refreshToken) {
    try {
      await fetch(`${API_BASE}/api/v1/tenant-auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantAccessToken}`
        },
        body: JSON.stringify({ refreshToken })
      });
    } catch {
      // Offline or server unreachable — local logout still proceeds below.
    }
  }

  clearTenantSession();
}

const SILENT_REFRESH_INTERVAL_MS = 10 * 60 * 1000; // well inside the 15-minute access-token TTL

async function refreshTenantSession(): Promise<boolean> {
  const refreshToken = (() => {
    try {
      return localStorage.getItem(TENANT_REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  })();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE}/api/v1/tenant-auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    const data = await parseJsonResponse(res);
    if (!res.ok) {
      clearTenantSession();
      return false;
    }
    tenantAccessToken = data.accessToken;
    if (data.refreshToken) {
      try {
        localStorage.setItem(TENANT_REFRESH_TOKEN_KEY, data.refreshToken);
      } catch {
        // Storage unavailable — the in-memory access token still refreshed for this run.
      }
    }
    return true;
  } catch {
    // Network error — leave the existing (possibly still-valid) state alone; retry next tick.
    return true;
  }
}

/** Call once at app init if isStaffLoggedIn(), and again right after staffLogin(). */
export function startSilentRefresh(): void {
  if (silentRefreshTimer) return;
  void refreshTenantSession();
  silentRefreshTimer = setInterval(() => {
    void refreshTenantSession();
  }, SILENT_REFRESH_INTERVAL_MS);
}

export function stopSilentRefresh(): void {
  if (silentRefreshTimer) {
    clearInterval(silentRefreshTimer);
    silentRefreshTimer = null;
  }
}
