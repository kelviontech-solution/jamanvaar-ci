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

import { DeviceGate, PlatformNotice, type PlatformNoticeData, sendHeartbeat, pullRestaurantIdentity, orderSyncPullQuery, EndpointResolver } from '@jamanvaar/sync';
import type { OrderSyncPushEvent, OrderSyncPushResult, CloudSyncedOrder, EntitySyncEvent, EntitySyncPushResult, CloudSyncedEntity } from '@jamanvaar/sync';
import { db, LicenseRepository, MenuRepository, RestaurantIdentityRepository, TenantIsolation } from '@jamanvaar/database';

const API_BASE = import.meta.env.VITE_CLOUD_API_BASE_URL ?? 'http://localhost:4000';
// Operational traffic goes to the restaurant's Branch Core when one is configured and reachable; the cloud otherwise.
EndpointResolver.setTransport((url, init) => DeviceGate.gatedFetch(url, init));
EndpointResolver.configure({ cloudBase: API_BASE, coreUrl: import.meta.env.VITE_BRANCH_CORE_URL });

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

/**
 * Unbinds this terminal (BUG-145 follow-up): a device the cloud no longer recognises, or has revoked, was
 * stuck forever behind the lock screen with no way back to activation, since `isDeviceConnected()` (and so
 * the whole connect screen) is gated on `RESTAURANT_ID_KEY`, not the device token. Clearing it, along with the
 * device token and label, is what actually returns this console to the connect/activation screen.
 */
export function resetTerminal(): void {
  try {
    localStorage.removeItem(RESTAURANT_ID_KEY);
    localStorage.removeItem(DEVICE_LABEL_KEY);
    localStorage.removeItem(DEVICE_TOKEN_KEY);
  } catch {
    // Storage unavailable - nothing to clear, but the gate reset below still lets a reload retry cleanly.
  }
  DeviceGate.reset();
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
  /** The restaurant's internal id, resolved server-side from the restaurantCode the operator
   *  typed (owner-only connect flow) — connectDeviceStep2 still needs this to persist the
   *  connection, but the caller here never had it to begin with. */
  restaurantId: string;
  /** The owner's display name, when known (owner-only connect flow) — connectDeviceStep2's
   *  ownerLabel parameter, since there's no typed email to fall back to for that anymore. */
  ownerLabel?: string;
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
      restaurantName: data.restaurant?.name ?? restaurantId.trim(),
      restaurantId: data.restaurant?.id ?? restaurantId.trim()
    };
  }

  // LOGIN_SUCCESS on the very first call means this restaurant/email
  // combination already has an active, non-device-scoped session type —
  // treat it the same as connected rather than erroring.
  persistConnection(restaurantId, data?.user?.fullName ?? email.trim());
  return { status: 'CONNECTED' };
}

/**
 * Owner-only variant of connectDeviceStep1 (spec sections 7/54/55): the operator enters the
 * restaurant's customer-facing Restaurant ID (JM…) and the owner's password — no email. Same
 * two return shapes, same downstream connectDeviceStep2 call.
 */
export async function connectDeviceStep1Owner(
  restaurantCode: string,
  password: string
): Promise<ConnectStepResult | ActivationRequiredResult> {
  const res = await fetch(`${API_BASE}/api/v1/tenant-auth/login-owner`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurantCode: restaurantCode.trim(),
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
      restaurantName: data.restaurant?.name ?? restaurantCode.trim(),
      restaurantId: data.restaurant?.id,
      ownerLabel: data.user?.fullName
    };
  }

  persistConnection(data?.restaurant?.id, data?.user?.fullName ?? 'Owner');
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
  ownerLabel: string,
  restaurantName?: string
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
    DeviceGate.reportSuccess(); // a fresh activation starts unlocked
  } catch {
    // Storage unavailable — the device is still activated server-side, this terminal just won't remember its own token across reloads.
  }

  // Bind this console to the real restaurant, like every other terminal does at activation (BUG-131): it kept
  // showing the demo "JAMANVAAR RESTAURANT - Ahmedabad Flagship Store", and the demo menu, combos, coupons
  // (with their made-up usage counts) and tables, as if they were the restaurant's own.
  if (restaurantName) RestaurantIdentityRepository.adopt(restaurantId.trim(), { name: restaurantName });
  MenuRepository.startFreshMenu();
  RestaurantIdentityRepository.startFreshOperations();
}

/**
 * A console that was connected before it adopted the restaurant's identity (or whose local data was reset)
 * still holds the demo name: give it the real one the first time it signs in (BUG-131).
 */
function adoptRestaurantIdentity(restaurantId: string, restaurantName: unknown): void {
  if (typeof restaurantName !== 'string' || !restaurantName) return;
  if (db.restaurant.id === restaurantId.trim() && db.restaurant.name === restaurantName) return;
  RestaurantIdentityRepository.adopt(restaurantId.trim(), { name: restaurantName });
}

function persistConnection(restaurantId: string, label: string): void {
  try {
    TenantIsolation.enter(restaurantId.trim(), { unknownIsForeign: false }); // a different restaurant's local data is never carried over
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
  adoptRestaurantIdentity(restaurantId, data.restaurant?.name);
  const user: StaffUser = { fullName: data.user.fullName, role: data.user.role };
  persistTenantSession(data.refreshToken, user);
  startSilentRefresh();
  return user;
}

/**
 * Owner-only daily login (spec sections 7/33/54): just the owner's password — the restaurant is
 * already known (this terminal is connected), so there's no code or email to type every time.
 */
export async function staffLoginOwner(restaurantId: string, password: string): Promise<StaffUser> {
  const res = await fetch(`${API_BASE}/api/v1/tenant-auth/login-owner`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurantId,
      password,
      returnRefreshToken: true
    })
  });

  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Login failed (${res.status})`, res.status);
  }

  tenantAccessToken = data.accessToken;
  adoptRestaurantIdentity(restaurantId, data.restaurant?.name);
  const user: StaffUser = { fullName: data.user.fullName, role: data.user.role };
  persistTenantSession(data.refreshToken, user);
  startSilentRefresh();
  return user;
}

export type OwnerIdentifier = { restaurantCode: string } | { restaurantId: string };

function identifierBody(identifier: OwnerIdentifier): Record<string, string> {
  return 'restaurantCode' in identifier ? { restaurantCode: identifier.restaurantCode.trim() } : { restaurantId: identifier.restaurantId };
}

/**
 * Restaurant-code forgot-password, step 1 (spec section 34): resolves the owner and masks
 * their email for display. Accepts either the typed restaurantCode or an already-connected
 * device's stored restaurantId — the daily-login screen's "Forgot Password?" never has the
 * code, only the internal id it already knows.
 */
export async function requestPasswordResetOwner(identifier: OwnerIdentifier): Promise<{ maskedEmail: string }> {
  const res = await fetch(`${API_BASE}/api/v1/tenant-auth/forgot-password-owner`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(identifierBody(identifier))
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Could not send the code (${res.status})`, res.status);
  }
  return { maskedEmail: data.maskedEmail };
}

/** Restaurant-code forgot-password, step 2: the emailed code and the new password. */
export async function resetPasswordOwner(identifier: OwnerIdentifier, otp: string, newPassword: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/tenant-auth/reset-password-owner`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...identifierBody(identifier), otp: otp.trim(), newPassword })
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Could not reset the password (${res.status})`, res.status);
  }
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
  return EndpointResolver.fetch(path, {
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
    const restaurantId = localStorage.getItem(RESTAURANT_ID_KEY);
    void sendHeartbeat({
      apiBase: API_BASE,
      deviceToken,
      appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0',
      restaurantId
    });
    // B2-054: picks up a restaurant-identity edit made on another device (or by Super Admin).
    if (restaurantId) void pullRestaurantIdentity({ apiBase: API_BASE, deviceToken, restaurantId });
  };
  beat();
  setInterval(beat, intervalMs);
}

// --- Device sync bridge (BUG-130/132/133/136/137) ---
// Kiosk Admin used to make one cloud call for its menu (a price table for payments) and nothing else, so
// what was edited here never reached the self-order kiosk and what the kiosk sold never reached this console.
// It now syncs like every other terminal: with its own device credential, through the same order and entity
// endpoints.

export function getDeviceTokenForSync(): string | null {
  return getDeviceToken();
}

function deviceFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getDeviceToken();
  if (!token) return Promise.reject(new CloudApiError('Device not activated', 401));
  return DeviceGate.gatedFetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) }
  });
}

async function jsonOrThrow<T>(res: Response, what: string): Promise<T> {
  const data = await parseJsonResponse(res);
  if (!res.ok) throw new CloudApiError(data?.message ?? `${what} failed (${res.status})`, res.status);
  return data as T;
}

export interface PaymentsSummary {
  grossVolume: number;
  successfulCount: number;
  failedCount: number;
  refundedAmount: number;
}

export interface RecentPayment {
  id: string;
  externalOrderId: string;
  amount: number; // paise
  status: string;
  method: string | null;
  paidAt: string | null;
  createdAt: string;
  fulfilledAt: string | null;
  refundedAmount: number;
  refundableAmount: number;
  needsAttention: boolean;
}

export interface DayStatement {
  date: string;
  paymentCount: number;
  refundCount: number;
  grossVolume: number;
  refundedAmount: number;
  platformCommission: number;
  commissionReversed: number;
  restaurantGross: number;
  restaurantRefundImpact: number;
  netPayableToRestaurant: number;
  settlementNote: string;
  rows: Array<{ id: string; externalOrderId: string; amount: number; platformAmount: number; restaurantAmount: number; method: string | null; paidAt: string | null }>;
  rowsTruncated: boolean;
}

export async function getRecentPayments(): Promise<RecentPayment[]> {
  const data = await jsonOrThrow<{ rows: RecentPayment[] }>(await deviceFetch('/api/v1/payments/tenant-recent'), 'Recent payments');
  return data.rows;
}

/** A paid order the kiosk never produced a ticket for, marked as handled by staff. */
export async function markPaymentHandled(paymentId: string): Promise<void> {
  await jsonOrThrow(await deviceFetch(`/api/v1/payments/${paymentId}/fulfilled`, { method: 'POST' }), 'Mark payment handled');
}

/** Real Cashfree refund. The server re-checks the remaining refundable balance; Cashfree reverses the vendor share proportionally. */
export async function refundPayment(paymentId: string, amountPaise: number, reason: string, requestedBy: string): Promise<void> {
  await jsonOrThrow(
    await deviceFetch(`/api/v1/payments/${paymentId}/refund`, { method: 'POST', body: JSON.stringify({ amountPaise, reason, requestedBy }) }),
    'Refund'
  );
}

export async function getDayStatement(date: string): Promise<DayStatement> {
  return jsonOrThrow<DayStatement>(await deviceFetch(`/api/v1/payments/tenant-statement?date=${encodeURIComponent(date)}`), 'Day statement');
}

/** Online (Cashfree) revenue totals for this restaurant, in paise — device-authed, restaurant-scoped by the server. */
export async function getPaymentsSummary(): Promise<PaymentsSummary> {
  return jsonOrThrow<PaymentsSummary>(await deviceFetch('/api/v1/payments/tenant-summary'), 'Payments summary');
}

export async function pushOrderSync(events: OrderSyncPushEvent[]): Promise<{ results: OrderSyncPushResult[]; serverTime: string }> {
  return jsonOrThrow(await deviceFetch('/api/v1/orders/sync', { method: 'POST', body: JSON.stringify({ events }) }), 'Order sync push');
}

export async function pullOrderSync(cursor?: string): Promise<{ orders: CloudSyncedOrder[]; serverTime: string; latestSeq?: number; hasMore?: boolean }> {
  const query = orderSyncPullQuery(cursor);
  return jsonOrThrow(await deviceFetch(`/api/v1/orders/sync${query}`), 'Order sync pull');
}

export async function pushEntitySync(entityType: string, events: EntitySyncEvent[]): Promise<{ results: EntitySyncPushResult[]; serverTime: string }> {
  return jsonOrThrow(await deviceFetch(`/api/v1/entity-sync/${entityType}`, { method: 'POST', body: JSON.stringify({ events }) }), 'Entity sync push');
}

export async function pullEntitySync(entityType: string, since?: string): Promise<{ entities: CloudSyncedEntity[]; serverTime: string }> {
  const query = since ? `?since=${encodeURIComponent(since)}` : '';
  return jsonOrThrow(await deviceFetch(`/api/v1/entity-sync/${entityType}${query}`), 'Entity sync pull');
}

export interface CloudKiosk {
  id: string;
  name: string;
  appVersion: string | null;
  lastSeenAt: string | null;
  health: 'online' | 'degraded' | 'offline' | 'revoked' | 'pending' | 'never_seen';
  isLocked: boolean;
  lockReason: string | null;
  branchName: string | null;
  /** Changes on the kiosk not yet synced to the cloud. */
  pendingSyncCount: number;
  /** Set when the kiosk reports a problem (failed syncs, failing local storage). */
  syncError: string | null;
  lastSyncAt: string | null;
}

/** The self-order kiosks this restaurant has really activated: health, backlog and errors (BUG-132). */
export async function fetchCloudKiosks(): Promise<CloudKiosk[]> {
  const data = await jsonOrThrow<{
    devices: Array<{
      id: string; type: string; name: string | null; appVersion: string | null; lastSeenAt: string | null; lastSyncAt: string | null;
      health: CloudKiosk['health']; isLocked: boolean; lockReason: string | null; pendingSyncCount: number | null;
      syncError: string | null; branch: { name: string } | null;
    }>;
  }>(await deviceFetch('/api/v1/devices/me/fleet'), 'Kiosk fleet');
  return data.devices
    .filter((d) => d.type === 'KIOSK')
    .map((d) => ({
      id: d.id, name: d.name ?? 'Kiosk', appVersion: d.appVersion, lastSeenAt: d.lastSeenAt, health: d.health,
      isLocked: d.isLocked, lockReason: d.lockReason, branchName: d.branch?.name ?? null,
      pendingSyncCount: d.pendingSyncCount ?? 0, syncError: d.syncError, lastSyncAt: d.lastSyncAt
    }));
}

export type KioskCommandType = 'REQUEST_SYNC' | 'REQUEST_DIAGNOSTICS' | 'RESTART_APP' | 'CLEAR_CACHE' | 'LOCK' | 'UNLOCK';

/**
 * Sends a command to one kiosk through the cloud (authenticated as this console, audited, delivered on the
 * kiosk's next heartbeat, retried until acknowledged). A unique key per click makes a retried send harmless.
 */
export async function sendKioskCommand(kioskId: string, commandType: KioskCommandType, payload?: Record<string, unknown>): Promise<void> {
  const idempotencyKey = `${commandType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await jsonOrThrow(
    await deviceFetch(`/api/v1/devices/me/fleet/${kioskId}/commands`, {
      method: 'POST',
      body: JSON.stringify({ commandType, payload, idempotencyKey })
    }),
    'Kiosk command'
  );
}

/**
 * The real plan, kiosk allowance and end date for this restaurant (BUG-158). The License & Entitlement screen
 * showed a made-up key ("JAMAN-PRO-2026-AHM-8842-X"), a made-up end date and "2 / 5" kiosks whatever the
 * restaurant had bought. Needs the owner's signed-in session; offline or signed out it keeps what it last knew.
 */
let lastLicenseRefreshAt = 0;

export async function refreshLicenseFromCloud(activeKiosks: number): Promise<void> {
  if (!getTenantAccessToken()) return;
  // The plan changes rarely; the kiosk count is cheap to keep current, the request is not worth repeating every few seconds.
  if (Date.now() - lastLicenseRefreshAt < 5 * 60_000) {
    if (db.license.activeDevicesCount !== activeKiosks) LicenseRepository.updateLicense({ activeDevicesCount: activeKiosks });
    return;
  }
  lastLicenseRefreshAt = Date.now();
  try {
    const res = await tenantFetch('/api/v1/tenant/me/entitlements', { method: 'GET' });
    if (!res.ok) return;
    const data = (await res.json()) as {
      subscriptionStatus: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'EXPIRED' | null;
      expiresAt?: string | null;
      planName: string | null;
      planTier: string | null;
      limits: { maxDevices: number } | null;
    };
    const eligible = data.subscriptionStatus === 'ACTIVE' || data.subscriptionStatus === 'TRIAL';
    LicenseRepository.updateLicense({
      planName: data.planName ?? 'No active plan',
      tier: data.planTier === 'PRO' ? 'PRO' : 'CORE',
      status: eligible ? (data.subscriptionStatus === 'TRIAL' ? 'TRIAL' : 'ACTIVE') : data.subscriptionStatus === 'SUSPENDED' ? 'SUSPENDED' : 'EXPIRED',
      // The seeded demo key is not this restaurant's: there is no key to show.
      licenseKey: '',
      allowedDevicesCount: data.limits?.maxDevices ?? 0,
      activeDevicesCount: activeKiosks,
      validUntil: data.expiresAt ?? '',
      restaurantId: getConnectedRestaurantId() ?? db.restaurant.id
    });
  } catch {
    // Offline: keep what was last known.
  }
}

/** Kiosk Admin stores no device id, so it keeps a random local code that keeps its fallback order numbers unique. */
export function getLocalDeviceCode(): string {
  const KEY = 'jamanvaar_kiosk_admin_device_code';
  try {
    let code = localStorage.getItem(KEY);
    if (!code) {
      code = Array.from({ length: 12 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      localStorage.setItem(KEY, code);
    }
    return code;
  } catch {
    return 'ffffffffffff';
  }
}

/** Reserves a block of human order/KOT numbers for this device so offline terminals never issue the same number. */
export async function leaseNumberBlock(kind: 'ORDER' | 'KOT', count: number): Promise<{ kind: 'ORDER' | 'KOT'; prefix: string; businessDate: string; start: number; count: number }> {
  const res = await deviceFetch('/api/v1/sync/number-leases', { method: 'POST', body: JSON.stringify({ kind, count }) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.message) || `Number lease failed (${res.status})`);
  return data;
}
