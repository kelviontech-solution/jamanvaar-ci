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

import { DeviceGate, PlatformNotice, type PlatformNoticeData, sendHeartbeat } from '@jamanvaar/sync';

const API_BASE = import.meta.env.VITE_CLOUD_API_BASE_URL ?? 'http://localhost:4000';

const RESTAURANT_ID_KEY = 'jamanvaar_kiosk_admin_restaurant_id';
const DEVICE_LABEL_KEY = 'jamanvaar_kiosk_admin_device_label';
const DEVICE_TOKEN_KEY = 'jamanvaar_kiosk_admin_device_token';

function getDeviceToken(): string | null {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY);
  } catch {
    return null;
  }
}

export class CloudApiError extends Error {
  constructor(
    message: string,
    public status: number,
    /**
     * Per-field Zod validation failures from cloud/api's ZodValidationPipe.
     * Without these a 400 surfaces only as the generic "Validation failed",
     * which tells the restaurant nothing about which field it rejected.
     * Mirrors cloud/super-admin-web/src/api/client.ts's ApiError.
     */
    public issues?: Array<{ path: string; message: string }>
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

/**
 * Bumped every time the session is torn down (staffLogout, or an
 * auth-failure clear inside refreshTenantSession). Each refreshTenantSession()
 * call snapshots this value when it starts; if the epoch has moved by the
 * time its network response lands, the response is stale — logout raced
 * ahead of it — and is discarded instead of being allowed to repopulate
 * tenantAccessToken or write a rotated refresh token back to storage. This
 * is what makes "logged out" stick even against an in-flight refresh that
 * started just before the logout call.
 */
let sessionEpoch = 0;

type SessionExpiredListener = () => void;
const sessionExpiredListeners = new Set<SessionExpiredListener>();

/**
 * Subscribe to be notified whenever the tenant session is cleared — whether
 * from a deliberate staffLogout() or an async cause (refresh discovering the
 * refresh token is dead). Returns an unsubscribe function. Fires on a
 * deliberate logout too (clearTenantSession is the single choke point for
 * all teardown); that's harmless since callers already set their own
 * "logged out" UI state in that path.
 */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => {
    sessionExpiredListeners.delete(listener);
  };
}

function notifySessionExpired(): void {
  for (const listener of sessionExpiredListeners) {
    try {
      listener();
    } catch {
      // A misbehaving listener shouldn't stop the others from being notified.
    }
  }
}

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
  sessionEpoch++;
  tenantAccessToken = null;
  try {
    localStorage.removeItem(TENANT_REFRESH_TOKEN_KEY);
    localStorage.removeItem(TENANT_USER_KEY);
  } catch {
    // Storage unavailable — nothing to clean up.
  }
  notifySessionExpired();
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

/**
 * Standalone refresh call used only to obtain a fresh access token for
 * staffLogout() when tenantAccessToken is null (app booted offline, or
 * logout raced ahead of the boot-time refresh ever resolving). Deliberately
 * NOT routed through refreshTenantSession(): staffLogout() has already
 * bumped sessionEpoch by the time this runs, so refreshTenantSession's own
 * epoch check would just discard its own result as stale. This helper talks
 * to the server directly and hands its result back to the caller instead,
 * touching no shared/module state.
 *
 * The refresh endpoint unconditionally rotates the refresh token (old one
 * revoked server-side the instant this call is made), so the caller must
 * revoke the *returned* refreshToken, not the one it started with.
 */
async function fetchAccessTokenForRevocation(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/tenant-auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    if (!res.ok) return null;
    const data = await parseJsonResponse(res);
    if (!data?.accessToken || !data?.refreshToken) return null;
    return { accessToken: data.accessToken, refreshToken: data.refreshToken };
  } catch {
    return null;
  }
}

export async function staffLogout(): Promise<void> {
  const refreshToken = (() => {
    try {
      return localStorage.getItem(TENANT_REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  })();

  // Invalidate any refresh already in flight (e.g. a periodic silent-refresh
  // tick that started a moment ago) *before* awaiting anything below, so its
  // response — however it resolves — gets discarded by refreshTenantSession's
  // epoch check instead of landing after clearTenantSession() and resurrecting
  // the session. See the sessionEpoch comment above for the full mechanism.
  sessionEpoch++;
  stopSilentRefresh();

  if (refreshToken) {
    let accessToken = tenantAccessToken;
    let tokenToRevoke = refreshToken;

    if (!accessToken) {
      // No access token in memory — obtain one specifically so the
      // revocation call below can be authenticated. This is what closes the
      // "logout before the first boot-time refresh ever resolved" gap: the
      // old code silently skipped the server call entirely in this case.
      const fresh = await fetchAccessTokenForRevocation(refreshToken);
      if (fresh) {
        accessToken = fresh.accessToken;
        tokenToRevoke = fresh.refreshToken;
      }
    }

    if (accessToken) {
      try {
        await fetch(`${API_BASE}/api/v1/tenant-auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({ refreshToken: tokenToRevoke })
        });
      } catch {
        // Offline or server unreachable — local logout still proceeds below.
      }
    }
  }

  // Always ends with local state fully cleared, even if every server call
  // above failed or was skipped (offline) — a logged-out UI must never be
  // contingent on network success.
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

  // Snapshot the epoch before the network round-trip. If staffLogout() runs
  // while this request is in flight, it bumps sessionEpoch and clears the
  // session immediately; when this response lands afterward, the mismatch
  // below is what stops it from writing a fresh tenantAccessToken or a
  // rotated refresh token back into a session that's already been torn down.
  const epochAtStart = sessionEpoch;

  try {
    const res = await fetch(`${API_BASE}/api/v1/tenant-auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    const data = await parseJsonResponse(res);

    if (sessionEpoch !== epochAtStart) {
      // Stale: a logout (or other session teardown) started after this
      // request was sent. Discard the response entirely — do not touch
      // tenantAccessToken or storage either way, ok or not.
      return false;
    }

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        // The refresh token itself is dead (expired/revoked) — this is a
        // real auth failure, not a transient outage. Clear the session.
        clearTenantSession();
        return false;
      }
      // Any other non-OK status (500/502/503/429/...) is a transient server
      // problem, not proof the refresh token is invalid. Leave state alone
      // and let the next scheduled tick retry — logging every kiosk out
      // because the API hiccuped once would be worse than briefly stale auth.
      return true;
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

// --- Payment Connection (Task 4) ---

export interface PaymentConnectionFields {
  accountType: 'BUSINESS' | 'INDIVIDUAL';
  businessType?: string;
  pan: string;
  gst?: string;
  cin?: string;
  uidai?: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  settlementAccountName?: string;
  settlementAccountNumber?: string;
  settlementIfsc?: string;
  settlementUpiVpa?: string;
}

export interface PaymentConnectionStatus {
  status: 'NOT_CONNECTED' | 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'DISCONNECTED';
  accountType?: string | null;
  businessType?: string | null;
  pan?: string | null;
  // toOwnView() in cloud/api has always returned these three; they were
  // simply missing from this interface, which is why the form could never
  // round-trip them.
  gst?: string | null;
  cin?: string | null;
  uidai?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  settlementAccountName?: string | null;
  settlementIfsc?: string | null;
  settlementUpiVpa?: string | null;
}

async function tenantFetch(path: string, init: RequestInit): Promise<Response> {
  const token = getTenantAccessToken();
  if (!token) {
    throw new CloudApiError('Not signed in', 401);
  }
  return DeviceGate.gatedFetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) }
  });
}

export async function getPaymentConnection(): Promise<PaymentConnectionStatus> {
  const res = await tenantFetch('/api/v1/tenant/payment-connection', { method: 'GET' });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Failed to load payment connection (${res.status})`, res.status);
  }
  return data;
}

export async function submitPaymentConnection(fields: PaymentConnectionFields): Promise<PaymentConnectionStatus> {
  // The form always holds every field, including optional ones the user
  // cleared back to ''. The API's optional string fields still carry
  // .min(1), so an empty string is a 400 — omit them instead of sending ''.
  const cleaned = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== '')) as PaymentConnectionFields;
  const res = await tenantFetch('/api/v1/tenant/payment-connection', { method: 'POST', body: JSON.stringify(cleaned) });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Submission failed (${res.status})`, res.status, data?.issues);
  }
  return data;
}

// --- Menu Sync (Phase 3 prerequisite) ---

import type { MenuItem } from '@jamanvaar/types';

interface MenuSyncItemPayload {
  externalItemId: string;
  name: string;
  category?: string;
  basePrice: number; // paise
  modifierGroups: Array<{
    id: string;
    name: string;
    isRequired: boolean;
    minSelections: number;
    maxSelections: number;
    options: Array<{ id: string; name: string; priceDelta: number }>;
  }>;
  taxRate: number; // basis points, e.g. 500 = 5.00%
  isAvailable: boolean;
}

/**
 * The local domain model stores rupee amounts and treats item price as
 * already tax-exclusive (packages/business/src/pricing.ts's calculateCart
 * adds CGST+SGST on top of item.price unconditionally — confirmed directly,
 * it does not consult TaxGroup.isInclusive). cloud/api's pricing.util.ts
 * does the identical "add tax on top of basePrice" math, so this is a
 * straightforward rupee->paise conversion, not a tax-inclusive/exclusive
 * split.
 */
function toMenuSyncItem(item: MenuItem, taxRatePercent: number): MenuSyncItemPayload {
  return {
    externalItemId: item.id,
    name: item.name,
    category: undefined,
    basePrice: Math.round((item.basePrice ?? item.price) * 100),
    modifierGroups: (item.modifierGroups ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      isRequired: g.isRequired,
      minSelections: g.minSelections,
      maxSelections: g.maxSelections,
      options: g.options.map((o) => ({ id: o.id, name: o.name, priceDelta: Math.round(o.priceDelta * 100) }))
    })),
    taxRate: Math.round(taxRatePercent * 100),
    isAvailable: item.isAvailable
  };
}

/**
 * Pushes every kiosk-enabled menu item to cloud/api's MenuSnapshotItem
 * table, which PaymentOrdersController prices kiosk-user's real orders
 * against. A silent no-op (not an error) if this terminal has never been
 * activated (getDeviceToken() null) or has no kiosk-enabled items — most
 * callers of this function don't want a boot-time failure surfaced to the
 * Kiosk Admin operator for something this invisible.
 */
export async function syncMenuToCloud(items: MenuItem[], taxGroups: Array<{ id: string; cgstPercent: number; sgstPercent: number }>): Promise<void> {
  const token = getDeviceToken();
  if (!token) return;

  const kioskItems = items.filter((i) => i.isKioskEnabled);
  if (kioskItems.length === 0) return;

  const payload = {
    items: kioskItems.map((item) => {
      const taxGroup = taxGroups.find((tg) => tg.id === item.taxGroupId);
      const taxRatePercent = taxGroup ? taxGroup.cgstPercent + taxGroup.sgstPercent : 0;
      return toMenuSyncItem(item, taxRatePercent);
    })
  };

  const res = await fetch(`${API_BASE}/api/v1/tenant/menu-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const data = await parseJsonResponse(res);
    throw new CloudApiError(data?.message ?? `Menu sync failed (${res.status})`, res.status);
  }
}

/**
 * Restaurant Admin has no terminal heartbeat, so it asks for the platform announcement
 * (maintenance etc.) itself. Offline or signed out, it keeps whatever it last knew.
 */
export function startPlatformNoticePolling(intervalMs = 60_000): void {
  const poll = async () => {
    try {
      if (!getTenantAccessToken()) return;
      const res = await tenantFetch('/api/v1/tenant/platform-notice', { method: 'GET' });
      if (res.ok) PlatformNotice.apply(((await res.json()) as { notice: PlatformNoticeData | null }).notice);
    } catch {
      // Offline or signed out: keep the last known notice.
    }
  };
  void poll();
  setInterval(poll, intervalMs);
}

/** Kiosk Admin's own terminal heartbeat (it had none, so it always showed as never seen). */
export function startDeviceHeartbeat(intervalMs = 15_000): void {
  const beat = () => {
    const deviceToken = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (!deviceToken) return;
    void sendHeartbeat({
      apiBase: API_BASE,
      deviceToken,
      appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0',
      restaurantId: localStorage.getItem(RESTAURANT_ID_KEY)
    });
  };
  beat();
  setInterval(beat, intervalMs);
}
