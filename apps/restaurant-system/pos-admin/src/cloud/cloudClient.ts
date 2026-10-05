import type { OrderSyncPushEvent, OrderSyncPushResult, CloudSyncedOrder, PushedMovement, RemoteMovement } from '@jamanvaar/sync';
import { refreshAiConfigIfStale, reportAiQuery } from '@jamanvaar/business';
import type { PlanEntitlements, PlanTier } from '@jamanvaar/types';

/**
 * Restaurant Admin's only connection to cloud/api — see
 * docs/architecture/super-admin-architecture.md §I.4 (last item) and §I.1/§I.2.
 *
 * This app is local-first by design: nothing here is required for it to keep
 * working offline. A restaurant that has never entered an activation code
 * never calls any of these functions' network paths at all — see
 * SubscriptionPlansView.tsx, which only reads from this module and always has
 * the existing local mock (LicenseRepository) as its fallback.
 */

import { DeviceGate, sendHeartbeat, PlatformNotice, type PlatformNoticeData, pullRestaurantIdentity, pushRestaurantIdentity, type RestaurantIdentityFields, orderSyncPullQuery, EndpointResolver, publishCatalogNow, getDevicePublicKeyJwk, signDeviceRequest } from '@jamanvaar/sync';
import { MenuRepository, PrinterRepository, InventoryRepository, RestaurantIdentityRepository, LicenseRepository, TenantIsolation } from '@jamanvaar/database';

const API_BASE = import.meta.env.VITE_CLOUD_API_BASE_URL ?? 'http://localhost:4000';
// Operational traffic goes to the restaurant's Branch Core when one is configured and reachable; the cloud otherwise.
EndpointResolver.setTransport((url, init) => DeviceGate.gatedFetch(url, init));
EndpointResolver.configure({ cloudBase: API_BASE, coreUrl: import.meta.env.VITE_BRANCH_CORE_URL });

const RESTAURANT_ID_KEY = 'jamanvaar_cloud_restaurant_id';
const ENTITLEMENTS_CACHE_KEY = 'jamanvaar_cloud_entitlements_cache';
const DEVICE_ID_KEY = 'jamanvaar_cloud_device_id';
const DEVICE_TOKEN_KEY = 'jamanvaar_cloud_device_token';

export class CloudApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

/** The restaurant as the platform holds it (BUG-158): the real name and the legal details. */
export interface CloudRestaurantProfile {
  id: string;
  name: string;
  legalName?: string | null;
  gstin?: string | null;
  fssaiNumber?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
}

export interface CloudEntitlementsResponse {
  subscriptionStatus: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'EXPIRED' | null;
  /** When the current subscription ends. */
  expiresAt?: string | null;
  planName: string | null;
  planTier: PlanTier | 'ENTERPRISE' | null;
  entitlements: PlanEntitlements | null;
  limits: { maxBranches: number; maxDevices: number; maxUsers: number } | null;
}

interface CachedEntitlements {
  data: CloudEntitlementsResponse;
  syncedAt: string; // ISO timestamp
}

let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;

/** The restaurant this console is connected to (shown so the owner can give it to Kiosk Admin or Captain). */
export function getStoredRestaurantId(): string | null {
  return getRestaurantId();
}

function getRestaurantId(): string | null {
  try {
    return localStorage.getItem(RESTAURANT_ID_KEY);
  } catch {
    return null;
  }
}

function setRestaurantId(id: string) {
  try {
    TenantIsolation.enter(id, { unknownIsForeign: false }); // a different restaurant's local data is never carried over
    localStorage.setItem(RESTAURANT_ID_KEY, id);
  } catch {
    // Storage unavailable (private mode, etc.) — connection just won't persist across reloads.
  }
}

export function getStoredDeviceId(): string | null {
  try {
    return localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    return null;
  }
}

export function getStoredDeviceToken(): string | null {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveDeviceRegistration(deviceId: string, deviceToken: string, restaurantId: string) {
  try {
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
    localStorage.setItem(DEVICE_TOKEN_KEY, deviceToken);
    DeviceGate.reportSuccess(); // a fresh activation starts unlocked
    MenuRepository.startFreshMenu(); // BUG-013: a real restaurant starts with no menu until one is uploaded
    RestaurantIdentityRepository.startFreshOperations(); // BUG-115: ...and no demo combos, coupons, offers or tables
    PrinterRepository.startFresh(); // BUG-025: ...and no printers until real ones are added
    InventoryRepository.startFresh(); // BUG-045: ...and no demo ingredients/stock
    TenantIsolation.enter(restaurantId, { unknownIsForeign: false }); // a different restaurant's local data is never carried over
    localStorage.setItem(RESTAURANT_ID_KEY, restaurantId);
  } catch {
    // Storage unavailable
  }
}

/**
 * Unbinds this console from the cloud (BUG-145 follow-up): a device the cloud no longer recognises, or has
 * revoked, was stuck forever behind the lock screen with no way back to activation, since `isCloudConnected()`
 * checks `RESTAURANT_ID_KEY`, not the device token, so the old (unused) `clearDeviceRegistration` alone would
 * not have returned this console to the connect screen. This app is local-first — the local admin login and
 * the day-to-day database are untouched; only the cloud/device link is reset, and screens that need it (owner
 * cloud sign-in, backups, Help & Support) fall back to asking to reconnect.
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

/** @deprecated use `resetTerminal`, which also clears the restaurant id so the app actually returns to the connect screen. */
export function clearDeviceRegistration() {
  try {
    localStorage.removeItem(DEVICE_ID_KEY);
    localStorage.removeItem(DEVICE_TOKEN_KEY);
  } catch {
    // ignore
  }
}

function getCachedEntitlements(): CachedEntitlements | null {
  try {
    const raw = localStorage.getItem(ENTITLEMENTS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedEntitlements) : null;
  } catch {
    return null;
  }
}

function setCachedEntitlements(data: CloudEntitlementsResponse) {
  try {
    const cached: CachedEntitlements = { data, syncedAt: new Date().toISOString() };
    localStorage.setItem(ENTITLEMENTS_CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Non-fatal — just means no offline fallback next time.
  }
}

export function isCloudConnected(): boolean {
  return getRestaurantId() !== null;
}

async function refreshAccessToken(): Promise<boolean> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) return false;
  try {
    const res = await fetch(`${API_BASE}/api/v1/tenant-auth/refresh`, {
      method: 'POST',
      credentials: 'include'
    });
    if (!res.ok) {
      accessToken = null;
      return false;
    }
    const body = await res.json();
    accessToken = body.accessToken;
    return true;
  } catch {
    accessToken = null;
    return false;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  skipAuthRetry?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await EndpointResolver.fetch(path, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (res.status === 401 && !options.skipAuthRetry) {
    if (!refreshInFlight) {
      refreshInFlight = refreshAccessToken().finally(() => {
        refreshInFlight = null;
      });
    }
    const refreshed = await refreshInFlight;
    if (refreshed) {
      return request<T>(path, { ...options, skipAuthRetry: true });
    }
  }

  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await res.json() : undefined;

  if (!res.ok) {
    const issues = Array.isArray(data?.issues) ? (data.issues as Array<{ message?: string }>).map((i) => i.message).filter(Boolean).join(' ') : '';
    throw new CloudApiError(issues || data?.message || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

/** Step 1 of connecting to cloud: redeem the activation code, learn this restaurant's id. */
export async function redeemActivationCode(code: string, appVersion?: string): Promise<{ restaurantId: string }> {
  const result = await request<{ restaurantId: string }>('/api/v1/activation/redeem', {
    method: 'POST',
    body: { code, deviceType: 'POS_ADMIN', appVersion }
  });
  setRestaurantId(result.restaurantId);
  return result;
}

export interface CloudAuthSuccess {
  requiresActivation: false;
  user: { id: string; fullName: string; role: string; restaurantId: string; email: string };
  restaurant: CloudRestaurantProfile;
  deviceId?: string;
}

export interface CloudAuthActivationRequired {
  requiresActivation: true;
  activationSessionToken: string;
  restaurant: CloudRestaurantProfile;
  user: { id: string; fullName: string; email: string };
  message: string;
}

export type CloudAuthResult = CloudAuthSuccess | CloudAuthActivationRequired;

/**
 * Universal Restaurant Admin Cloud Login:
 * Sends email, password, and persistent device credentials.
 * Returns either direct LOGIN_SUCCESS (requiresActivation: false) or ACTIVATION_REQUIRED (requiresActivation: true).
 */
export async function cloudLogin(
  email: string,
  password: string
): Promise<CloudAuthResult> {
  const deviceId = getStoredDeviceId() || undefined;
  const deviceToken = getStoredDeviceToken() || undefined;

  const result = await request<
    | {
        status: 'LOGIN_SUCCESS';
        requiresActivation: false;
        accessToken: string;
        user: { id: string; fullName: string; role: string; restaurantId: string; email: string };
        restaurant: CloudRestaurantProfile;
        deviceId?: string;
        deviceToken?: string;
      }
    | {
        status: 'ACTIVATION_REQUIRED';
        requiresActivation: true;
        activationSessionToken: string;
        restaurant: CloudRestaurantProfile;
        user: { id: string; fullName: string; email: string };
        message: string;
      }
  >('/api/v1/tenant-auth/login', {
    method: 'POST',
    body: {
      email,
      password,
      deviceId,
      deviceToken,
      deviceType: 'POS_ADMIN',
      // security-audit HIGH-04: the server now enforces this unconditionally for
      // deviceType POS_ADMIN regardless of this flag, but sending it explicitly keeps
      // this call self-documenting and matches kiosk-admin's equivalent call.
      adminOnly: true
    }
  });

  if (result.status === 'LOGIN_SUCCESS') {
    accessToken = result.accessToken;
    setRestaurantId(result.restaurant.id);
    if (result.deviceId && result.deviceToken) {
      saveDeviceRegistration(result.deviceId, result.deviceToken, result.restaurant.id);
    }
    return {
      requiresActivation: false,
      user: result.user,
      restaurant: result.restaurant,
      deviceId: result.deviceId
    };
  }

  return {
    requiresActivation: true,
    activationSessionToken: result.activationSessionToken,
    restaurant: result.restaurant,
    user: result.user,
    message: result.message
  };
}

/**
 * Owner-only Restaurant Admin login (spec sections 5/33): Restaurant ID (JM…) + the owner's
 * password — no email, no ambiguity about which restaurant. Same two-shape response as
 * cloudLogin (LOGIN_SUCCESS / ACTIVATION_REQUIRED).
 */
export async function cloudLoginOwner(restaurantCode: string, password: string): Promise<CloudAuthResult> {
  const deviceId = getStoredDeviceId() || undefined;
  const deviceToken = getStoredDeviceToken() || undefined;

  const result = await request<
    | {
        status: 'LOGIN_SUCCESS';
        requiresActivation: false;
        accessToken: string;
        user: { id: string; fullName: string; role: string; restaurantId: string; email: string };
        restaurant: CloudRestaurantProfile;
        deviceId?: string;
        deviceToken?: string;
      }
    | {
        status: 'ACTIVATION_REQUIRED';
        requiresActivation: true;
        activationSessionToken: string;
        restaurant: CloudRestaurantProfile;
        user: { id: string; fullName: string; email: string };
        message: string;
      }
  >('/api/v1/tenant-auth/login-owner', {
    method: 'POST',
    body: { restaurantCode, password, deviceId, deviceToken, deviceType: 'POS_ADMIN' }
  });

  if (result.status === 'LOGIN_SUCCESS') {
    accessToken = result.accessToken;
    setRestaurantId(result.restaurant.id);
    if (result.deviceId && result.deviceToken) {
      saveDeviceRegistration(result.deviceId, result.deviceToken, result.restaurant.id);
    }
    return {
      requiresActivation: false,
      user: result.user,
      restaurant: result.restaurant,
      deviceId: result.deviceId
    };
  }

  return {
    requiresActivation: true,
    activationSessionToken: result.activationSessionToken,
    restaurant: result.restaurant,
    user: result.user,
    message: result.message
  };
}

/**
 * Redeems an activation key for this authenticated session, binds the device in PostgreSQL,
 * and sets up persistent device credentials so future logins do not ask for activation.
 */
export async function cloudActivateDevice(
  activationSessionToken: string,
  activationKey: string
): Promise<{
  user: { id: string; fullName: string; role: string; restaurantId: string; email: string };
  restaurant: CloudRestaurantProfile;
  deviceId: string;
}> {
  const publicKeyJwk = await getDevicePublicKeyJwk('POS_ADMIN').catch(() => null);
  const result = await request<{
    status: 'LOGIN_SUCCESS';
    requiresActivation: false;
    accessToken: string;
    user: { id: string; fullName: string; role: string; restaurantId: string; email: string };
    restaurant: CloudRestaurantProfile;
    deviceId: string;
    deviceToken: string;
  }>('/api/v1/tenant-auth/activate-device', {
    method: 'POST',
    body: {
      activationSessionToken,
      activationKey,
      deviceType: 'POS_ADMIN',
      deviceName: 'Restaurant Admin Console',
      ...(publicKeyJwk ? { publicKeyJwk } : {})
    }
  });

  accessToken = result.accessToken;
  saveDeviceRegistration(result.deviceId, result.deviceToken, result.restaurant.id);
  setRestaurantId(result.restaurant.id);

  return {
    user: result.user,
    restaurant: result.restaurant,
    deviceId: result.deviceId
  };
}

/**
 * `activationToken` here is NOT the same as the ActivationKey code used to
 * connect a device (redeemActivationCode above) — it's the one-time
 * invitation token cloud/api mints for the owner USER specifically, returned
 * once to Super Admin at restaurant-creation time (SEC-001) and relayed to
 * the owner out-of-band. Without it this call always fails with 401/400.
 */
export async function cloudSetInitialPassword(email: string, activationToken: string, newPassword: string): Promise<void> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) {
    throw new CloudApiError('Not connected — enter an activation code first', 400);
  }
  await request('/api/v1/tenant-auth/set-initial-password', {
    method: 'POST',
    body: { restaurantId, email, activationToken, newPassword }
  });
}

/** "Forgot password" step 1 (BUG-142): asks the cloud to email a 6-digit code. It always succeeds for the caller, so it reveals nothing about who has an account. */
export async function cloudRequestPasswordReset(email: string): Promise<void> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) throw new CloudApiError('This terminal is not connected to a restaurant yet', 400);
  await request('/api/v1/tenant-auth/forgot-password', { method: 'POST', body: { restaurantId, email }, skipAuthRetry: true });
}

/** "Forgot password" step 2: the emailed code and the new password. */
export async function cloudResetPassword(email: string, otp: string, newPassword: string): Promise<void> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) throw new CloudApiError('This terminal is not connected to a restaurant yet', 400);
  await request('/api/v1/tenant-auth/reset-password', { method: 'POST', body: { restaurantId, email, otp, newPassword }, skipAuthRetry: true });
}

/**
 * Restaurant-code forgot-password, step 1 (spec section 34): resolves the owner and masks
 * their email for display. Unlike cloudRequestPasswordReset above, this never depends on
 * getRestaurantId() — a terminal that has never signed in yet has no stored restaurantId at
 * all (it's only set inside cloudLogin/cloudLoginOwner on success), so the operator types the
 * Restaurant ID directly here instead.
 */
export async function cloudRequestPasswordResetOwner(restaurantCode: string): Promise<{ maskedEmail: string; activationRequired: boolean }> {
  return request<{ maskedEmail: string; activationRequired: boolean }>('/api/v1/tenant-auth/forgot-password-owner', {
    method: 'POST',
    body: { restaurantCode },
    skipAuthRetry: true
  });
}

/** Restaurant-code forgot-password, step 2: the emailed code and the new password. */
export async function cloudResetPasswordOwner(restaurantCode: string, otp: string, newPassword: string): Promise<void> {
  await request('/api/v1/tenant-auth/reset-password-owner', {
    method: 'POST',
    body: { restaurantCode, otp, newPassword },
    skipAuthRetry: true
  });
}

/**
 * security-audit LOW-05: this used to just null the in-memory access token —
 * the server-side refresh session (a 30-day httpOnly cookie) stayed valid,
 * so anything that called request() after "sign out" (support tickets,
 * display scale, billing detail — every route not gated by
 * isCloudLoggedIn()) would silently re-authenticate via refreshAccessToken().
 * Revoke the refresh session server-side first, while the access token that
 * authorizes the call is still in memory, then clear local state regardless
 * of whether the network call succeeds (a terminal must be able to sign out
 * even if it's offline or the server is unreachable).
 */
export async function cloudLogout(): Promise<void> {
  try {
    await request('/api/v1/tenant-auth/logout', { method: 'POST', skipAuthRetry: true });
  } catch {
    // Best-effort — local sign-out must proceed either way.
  }
  accessToken = null;
}

/**
 * What to tell someone whose screen needs the cloud (BUG-163). "Connect this device" was shown even on a terminal
 * that is already activated and signed in, because the cloud session lives in memory and is gone after a reload.
 * Say the thing that is actually missing.
 */
export function cloudSetupHint(): string {
  if (!isCloudConnected()) return 'This device is not connected to JAMANVAAR Cloud yet. Connect it with an activation key in Settings, Subscription Plan.';
  return 'This device is connected to JAMANVAAR Cloud, but your cloud session has ended (it does not survive a reload). Sign out and sign in again with your owner login to continue.';
}

export function isCloudLoggedIn(): boolean {
  return accessToken !== null;
}

export interface CloudTenantUser {
  id: string;
  restaurantId: string;
  email: string;
  fullName: string;
  role: 'OWNER' | 'MANAGER' | 'STAFF';
  status: 'PENDING_ACTIVATION' | 'ACTIVE' | 'DISABLED';
  phone: string | null;
  invitedAt: string | null;
  activatedAt: string | null;
  createdAt: string;
}

/** Every login this restaurant has (the owner + any device/staff logins generated below). Owner-visible only. */
export async function fetchCloudLogins(): Promise<CloudTenantUser[]> {
  return request<CloudTenantUser[]>('/api/v1/tenant/me/users');
}

/**
 * Owner-only: mints an id + password for another app/device (Captain, a 2nd
 * POS terminal, etc.) — the password is chosen here and set immediately, no
 * separate invite/activation step for that device to go through.
 */
export async function createCloudLogin(input: {
  email: string;
  fullName: string;
  role: 'MANAGER' | 'STAFF';
  password: string;
}): Promise<CloudTenantUser> {
  return request<CloudTenantUser>('/api/v1/tenant/me/users', { method: 'POST', body: input });
}

export async function setCloudLoginStatus(userId: string, status: 'ACTIVE' | 'DISABLED'): Promise<CloudTenantUser> {
  return request<CloudTenantUser>(`/api/v1/tenant/me/users/${userId}/status`, { method: 'PATCH', body: { status } });
}

export interface CloudBackupSummary {
  id: string;
  method: 'MANUAL' | 'AUTOMATIC';
  status: 'COMPLETED' | 'FAILED';
  sizeBytes: number;
  createdAt: string;
}

/** Uploads a real off-device backup — requires cloud login (a real subscription-backed restaurant), unlike the always-available local JSON export. */
export async function uploadCloudBackup(data: unknown): Promise<CloudBackupSummary> {
  if (!isCloudLoggedIn()) {
    throw new CloudApiError('Log in to JAMANVAAR Cloud above to enable real off-device backup', 401);
  }
  return request<CloudBackupSummary>('/api/v1/tenant/me/backups', { method: 'POST', body: { data } });
}

export async function fetchCloudBackups(): Promise<CloudBackupSummary[]> {
  if (!isCloudLoggedIn()) return [];
  return request<CloudBackupSummary[]>('/api/v1/tenant/me/backups');
}

export interface CloudBranch {
  id: string;
  name: string;
  code: string;
  address: string | null;
  timezone: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  _count: { devices: number; users: number };
}

/**
 * Sibling branches under this same restaurant — read-only here (creating or
 * deactivating a branch stays a Super Admin action). This app is local-first
 * and tied to one physical outlet's own database, so this is a directory of
 * other outlets, not a way to view their live operational data.
 */
export async function fetchCloudBranches(): Promise<CloudBranch[]> {
  if (!isCloudLoggedIn()) return [];
  return request<CloudBranch[]>('/api/v1/tenant/branches');
}

/**
 * Tries the network first; on ANY failure (offline, not logged in, server
 * down) falls back to the last cached response instead of throwing — this
 * screen must never hard-fail just because the network is unavailable.
 */
export async function fetchEntitlements(): Promise<{ data: CloudEntitlementsResponse | null; syncedAt: string | null; stale: boolean }> {
  if (!isCloudConnected()) {
    return { data: null, syncedAt: null, stale: false };
  }

  try {
    const data = await request<CloudEntitlementsResponse>('/api/v1/tenant/me/entitlements');
    setCachedEntitlements(data);
    return { data, syncedAt: new Date().toISOString(), stale: false };
  } catch {
    const cached = getCachedEntitlements();
    return cached ? { data: cached.data, syncedAt: cached.syncedAt, stale: true } : { data: null, syncedAt: null, stale: false };
  }
}

/**
 * B2-055: a Super Admin plan change (PRO → CORE) locked the affected apps within seconds via the
 * device-gate heartbeat, but Restaurant Admin's own Subscription Plans page, sidebar badges and
 * JAMAN AI button kept reading the old tier — `LicenseRepository` was only ever refreshed from the
 * live cloud when the Subscription Plans screen happened to be mounted (its own `useEffect`), so
 * an owner not currently on that exact screen saw stale PRO-only features on a CORE plan
 * indefinitely. Pulled out of that screen's own refresh handler so the app's periodic sync tick
 * can keep `LicenseRepository` fresh regardless of which screen is open, the same way
 * POS/Captain/Kiosk detect their own app-level lock quickly via heartbeat — the Settings screen
 * still calls `fetchEntitlements()` itself for its own on-screen sync-status display, and passes
 * the result here for the shared "apply it locally" step.
 */
export function applyEntitlementsToLicense(data: CloudEntitlementsResponse): void {
  if (!data.planTier || !data.entitlements) return;
  const isPro = data.planTier === 'PRO';
  const isEligible = data.subscriptionStatus === 'ACTIVE' || data.subscriptionStatus === 'TRIAL';
  LicenseRepository.updateLicense({
    tier: isPro ? 'PRO' : 'CORE',
    planName: data.planName || (isPro ? 'JAMANVAAR PRO' : 'JAMANVAAR CORE'),
    price: isPro ? 7000 : 5000,
    status: isEligible ? 'ACTIVE' : 'SUSPENDED',
    entitlements: {
      ...data.entitlements,
      qrTableOrdering: isPro && data.entitlements.qrTableOrdering !== false
    }
  });
}

/** Fetches and applies in one call — what the app's periodic sync tick uses. */
export async function refreshCloudEntitlementsIntoLicense(): Promise<CloudEntitlementsResponse | null> {
  const { data } = await fetchEntitlements();
  if (data) applyEntitlementsToLicense(data);
  return data;
}

// ──────────────────────────────────────────────────────────────────────────
// Tenant Billing & Invoices Operations
// ──────────────────────────────────────────────────────────────────────────

export interface TenantBillingSummary {
  subscription: {
    id: string;
    status: string;
    planName: string;
    planTier: string;
    priceMonthly: number;
    expiresAt: string;
    daysRemaining: number;
  } | null;
  unpaidInvoicesCount: number;
  totalDue: number;
  totalPaid: number;
  invoicesCount: number;
  latestInvoice: any;
}

export interface TenantInvoice {
  id: string;
  invoiceNumber: string;
  amount: number; // paise
  taxAmount: number;
  totalAmount: number;
  status: 'ISSUED' | 'PAID' | 'PAST_DUE' | 'VOID';
  dueDate: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  paidAt: string | null;
  plan?: { name: string; tier: string };
  restaurant?: {
    name: string;
    legalName?: string;
    address?: string;
    city?: string;
    state?: string;
    gstin?: string;
    fssaiNumber?: string;
    users?: Array<{ fullName: string; email: string }>;
  };
  payments?: Array<{
    id: string;
    amount: number;
    method: string;
    referenceNumber?: string;
    receiptNumber?: string;
    createdAt: string;
  }>;
  taxBreakup?: {
    isIntraState: boolean;
    cgstRate: number;
    sgstRate: number;
    igstRate: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    taxAmount: number;
    totalAmount: number;
    sacCode: string;
  };
}

export interface TenantReceipt {
  receiptNumber: string;
  paymentDate: string;
  invoiceNumber: string;
  invoiceId: string;
  transactionId: string;
  paymentMethod: string;
  paymentStatus: string;
  amountPaid: number;
  amountPaidRupees: string;
  totalInvoiceAmount: number;
  totalPaid: number;
  balanceDue: number;
  planName: string;
  planTier: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  receivedFrom: {
    restaurantName: string;
    legalName: string;
    address: string | null;
    city: string | null;
    state: string | null;
    gstin: string | null;
    ownerName: string;
    ownerEmail: string;
  };
  seller: {
    companyName: string;
    address: string;
    gstin: string;
    sacCode: string;
  };
}

export async function fetchTenantBillingSummary(): Promise<TenantBillingSummary | null> {
  if (!isCloudLoggedIn()) return null;
  return request<TenantBillingSummary>('/api/v1/tenant/billing/summary');
}

export async function fetchTenantInvoices(): Promise<TenantInvoice[]> {
  if (!isCloudLoggedIn()) return [];
  return request<TenantInvoice[]>('/api/v1/tenant/billing/invoices');
}

export async function fetchTenantInvoiceDetail(invoiceId: string): Promise<TenantInvoice> {
  return request<TenantInvoice>(`/api/v1/tenant/billing/invoices/${invoiceId}`);
}

export async function fetchTenantReceipt(invoiceId: string): Promise<TenantReceipt> {
  return request<TenantReceipt>(`/api/v1/tenant/billing/invoices/${invoiceId}/receipt`);
}

export async function payTenantInvoice(
  invoiceId: string,
  payload: { amount?: number; method?: string; referenceNumber?: string; notes?: string }
): Promise<any> {
  return request(`/api/v1/tenant/billing/invoices/${invoiceId}/pay`, {
    method: 'POST',
    body: payload
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Tenant JAMAN AI Assistant & Intelligence Operations
// ──────────────────────────────────────────────────────────────────────────

export interface TenantAiConfig {
  isEntitled: boolean;
  tier: string;
  planName: string;
  upgradeRequired: boolean;
  proUpgradePrice: number;
  settings: {
    delayedKotMinutes: number;
    lowStockThreshold: number;
    cashDrawerVarianceThreshold: number;
    proactiveAlertsEnabled: boolean;
    mode: string;
  };
  categories: any[];
  questions: any[];
}

export async function fetchTenantAiConfig(): Promise<TenantAiConfig | null> {
  if (!isCloudLoggedIn()) return null;
  return request<TenantAiConfig>('/api/v1/tenant/ai-assistant/config');
}

export async function logTenantAiTelemetry(intent: string, queryText?: string): Promise<any> {
  if (!isCloudLoggedIn()) return;
  return request('/api/v1/tenant/ai-assistant/telemetry/log', {
    method: 'POST',
    body: { intent, queryText }
  }).catch(() => {});
}

/** Same device-authed bypass pattern as createRefund() below — order-sync and entity-sync are DeviceAuthGuard endpoints, not user-session ones. */
function deviceFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getStoredDeviceToken();
  if (!token) return Promise.reject(new CloudApiError('Device not activated', 401));
  return DeviceGate.gatedFetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) }
  });
}

/** Like deviceFetch, but also signs the request with this terminal's device-bound key, for payment routes. */
async function signedDeviceFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getStoredDeviceToken();
  if (!token) return Promise.reject(new CloudApiError('Device not activated', 401));
  const method = (init.method ?? 'GET').toUpperCase();
  const body = typeof init.body === 'string' ? init.body : '';
  const signed = await signDeviceRequest('POS_ADMIN', method, path, body).catch((err) => {
    console.error('Could not sign device request; sending unsigned:', err);
    return null;
  });
  return DeviceGate.gatedFetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(signed ? { 'x-device-signature': signed.signature, 'x-device-timestamp': signed.timestamp } : {}),
      ...(init.headers ?? {})
    }
  });
}

async function parseJsonResponse(res: Response): Promise<any> {
  const contentType = res.headers.get('content-type') ?? '';
  return contentType.includes('application/json') ? res.json() : undefined;
}

export interface PaymentsSummary {
  grossVolume: number;
  successfulCount: number;
  failedCount: number;
  refundedAmount: number;
}

/** Online (Razorpay) revenue totals for this restaurant, in paise — device-authed, restaurant-scoped by the server. */
export async function getPaymentsSummary(): Promise<PaymentsSummary> {
  const res = await signedDeviceFetch('/api/v1/payments/tenant-summary');
  const data = await parseJsonResponse(res);
  if (!res.ok) throw new CloudApiError(data?.message ?? `Payments summary failed (${res.status})`, res.status);
  return data as PaymentsSummary;
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

export async function pullOrderSync(cursor?: string): Promise<{ orders: CloudSyncedOrder[]; serverTime: string; latestSeq?: number; hasMore?: boolean }> {
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
  events: Array<{ externalId: string; payload: Record<string, unknown> }>
): Promise<{ results: Array<{ externalId: string; status: 'ok' | 'error'; syncVersion?: number; error?: string }>; serverTime: string }> {
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
): Promise<{ entities: Array<{ externalId: string; payload: Record<string, unknown>; updatedAt: string }>; serverTime: string }> {
  const query = since ? `?since=${encodeURIComponent(since)}` : '';
  const res = await deviceFetch(`/api/v1/entity-sync/${entityType}${query}`);
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Entity sync pull failed (${res.status})`, res.status);
  }
  return data;
}

export async function reportDeviceHeartbeat(): Promise<void> {
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

/** B2-054: Settings Save sends the owner's edit to the cloud, so every other terminal picks it up too. */
export async function saveRestaurantIdentity(identity: RestaurantIdentityFields): Promise<void> {
  const deviceToken = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (!deviceToken) return;
  await pushRestaurantIdentity({ apiBase: API_BASE, deviceToken, identity });
}

/**
 * The refund endpoint is device-authed, not session-authed like request<T>()
 * above (which sends the owner-login accessToken) — so this bypasses
 * request<T>() and sends the device token this app already has from its own
 * existing activation flow instead.
 */
export async function createRefund(paymentId: string, amountPaise: number, reason: string, requestedBy: string): Promise<{ refundId: string; providerRefundId: string; status: string; amount: number }> {
  const token = getStoredDeviceToken();
  if (!token) throw new CloudApiError('Device not activated', 401);

  const path = `/api/v1/payments/${paymentId}/refund`;
  const body = JSON.stringify({ amountPaise, reason, requestedBy });
  const signed = await signDeviceRequest('POS_ADMIN', 'POST', path, body).catch((err) => {
    console.error('Could not sign device request; sending unsigned:', err);
    return null;
  });
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(signed ? { 'x-device-signature': signed.signature, 'x-device-timestamp': signed.timestamp } : {})
    },
    body
  });
  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await res.json() : undefined;
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Refund failed (${res.status})`, res.status);
  }
  return data;
}



/**
 * Restaurant Admin has no terminal heartbeat, so it asks for the platform announcement
 * (maintenance etc.) itself. Offline or signed out, it keeps whatever it last knew.
 */
export function startPlatformNoticePolling(intervalMs = 60_000): void {
  const poll = async () => {
    try {
      if (!isCloudLoggedIn()) return;
      const res = await request<{ notice: PlatformNoticeData | null }>('/api/v1/tenant/platform-notice');
      PlatformNotice.apply(res.notice);
    } catch {
      // Offline or signed out: keep the last known notice.
    }
  };
  void poll();
  setInterval(poll, intervalMs);
}

/** Tell the cloud a JAMAN AI question was answered (usage + measured latency) and honour its daily limit. */
export async function reportAiQueryNow(intent: string, latencyMs: number): Promise<void> {
  const deviceToken = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (!deviceToken) return;
  await reportAiQuery({ apiBase: API_BASE, deviceToken, intent, latencyMs });
}

// ---- Support tickets (BUG-088): the restaurant raises and follows its own tickets ----------------

export type SupportTicketCategory = 'BILLING' | 'SYNC' | 'HARDWARE' | 'ONBOARDING' | 'FEATURE_REQUEST' | 'OTHER';
export type SupportTicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface SupportTicketRow {
  id: string;
  number: number;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface SupportTicketDetail extends SupportTicketRow {
  description: string;
  branchId: string | null;
  deviceId: string | null;
  raisedByName: string | null;
  comments: Array<{ id: string; body: string; authorType: 'PLATFORM' | 'RESTAURANT'; authorName: string | null; createdAt: string }>;
  events: Array<{ id: string; type: string; actorType: string; actorName: string | null; fromValue: string | null; toValue: string | null; createdAt: string }>;
  attachments: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number; uploadedByName: string | null; createdAt: string }>;
}

export function fetchSupportTickets(): Promise<SupportTicketRow[]> {
  return request<SupportTicketRow[]>('/api/v1/tenant/support-tickets');
}

export function fetchSupportTicket(id: string): Promise<SupportTicketDetail> {
  return request<SupportTicketDetail>(`/api/v1/tenant/support-tickets/${id}`);
}

/** This device is attached automatically so support can see which terminal the problem is on. */
export function createSupportTicket(input: {
  subject: string;
  description: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  branchId?: string;
}): Promise<SupportTicketRow> {
  return request<SupportTicketRow>('/api/v1/tenant/support-tickets', {
    method: 'POST',
    body: { ...input, deviceId: getStoredDeviceId() || undefined }
  });
}

export function replyToSupportTicket(id: string, body: string): Promise<unknown> {
  return request(`/api/v1/tenant/support-tickets/${id}/comments`, { method: 'POST', body: { body } });
}

export function attachToSupportTicket(id: string, file: { fileName: string; mimeType: string; dataBase64: string }): Promise<unknown> {
  return request(`/api/v1/tenant/support-tickets/${id}/attachments`, { method: 'POST', body: file });
}

export async function downloadSupportAttachment(ticketId: string, attachmentId: string): Promise<Blob> {
  const res = await DeviceGate.gatedFetch(`${API_BASE}/api/v1/tenant/support-tickets/${ticketId}/attachments/${attachmentId}`, {
    credentials: 'include',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
  });
  if (!res.ok) throw new CloudApiError(`Download failed (${res.status})`, res.status);
  return res.blob();
}

// ---- Terminal display size (BUG-008) ---------------------------------------------------------------

/** The restaurant's default display size for its terminals, in percent. */
export async function fetchDisplayScale(): Promise<number> {
  return (await request<{ displayScalePercent: number }>('/api/v1/tenant/me/display')).displayScalePercent;
}

export async function saveDisplayScale(percent: number): Promise<number> {
  return (await request<{ displayScalePercent: number }>('/api/v1/tenant/me/display', { method: 'PATCH', body: { displayScalePercent: percent } })).displayScalePercent;
}

// ---- WhatsApp ordering connector (docs/integrations/JAMANVAAR_WHATSAPP_CONNECTOR_IMPLEMENTATION_PLAN.md) ----

export interface WhatsAppChannelStatus {
  status: 'NOT_CONNECTED' | 'PENDING' | 'CONNECTED' | 'REVOKED';
  keyPrefix?: string;
  permissions?: string[];
  autoAccept?: boolean;
  prepTimeMinutes?: number | null;
  pausedAt?: string | null;
  connectedAt?: string | null;
  lastUsedAt?: string | null;
}

/** The current WhatsApp connector state for this restaurant. NOT_CONNECTED means no key
 *  has ever been generated. */
export async function fetchWhatsAppChannelStatus(): Promise<WhatsAppChannelStatus> {
  return request<WhatsAppChannelStatus>('/api/v1/tenant/whatsapp-channel/status');
}

/** Phase 6: whether this restaurant's plan actually includes WhatsApp Ordering right now —
 *  same shape/role as QR ordering's own entitlement check. Polled alongside status so the
 *  panel can grey out and explain why, the same way a plan downgrade locks QR ordering. */
export interface WhatsAppChannelEntitlement {
  enabled: boolean;
  reason: 'OK' | 'RESTAURANT_INACTIVE' | 'NO_SUBSCRIPTION' | 'SUBSCRIPTION_EXPIRED' | 'NOT_INCLUDED' | 'DISABLED';
  lockedMessage: string | null;
  planName: string | null;
}

export async function fetchWhatsAppChannelEntitlement(): Promise<WhatsAppChannelEntitlement> {
  return request<WhatsAppChannelEntitlement>('/api/v1/tenant/whatsapp-channel/entitlement');
}

/** Generates a fresh key, replacing any existing one. The raw key is returned exactly
 *  once, here — the caller must show it to the owner immediately; it is never retrievable
 *  again from any screen or API response. */
export async function generateWhatsAppChannelKey(): Promise<{ key: string; keyPrefix: string }> {
  return request<{ key: string; keyPrefix: string }>('/api/v1/tenant/whatsapp-channel/generate-key', { method: 'POST' });
}

export async function revokeWhatsAppChannelKey(): Promise<void> {
  await request('/api/v1/tenant/whatsapp-channel/revoke', { method: 'POST' });
}

export async function updateWhatsAppChannelSettings(input: { autoAccept?: boolean; prepTimeMinutes?: number; paused?: boolean }): Promise<WhatsAppChannelStatus> {
  return request<WhatsAppChannelStatus>('/api/v1/tenant/whatsapp-channel/settings', { method: 'PATCH', body: input });
}

/** Reserves a block of human order/KOT numbers for this device so offline terminals never issue the same number. */
export async function leaseNumberBlock(kind: 'ORDER' | 'KOT', count: number): Promise<{ kind: 'ORDER' | 'KOT'; prefix: string; businessDate: string; start: number; count: number }> {
  const res = await deviceFetch('/api/v1/sync/number-leases', { method: 'POST', body: JSON.stringify({ kind, count }) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.message) || `Number lease failed (${res.status})`);
  return data;
}

export async function pushInventoryMovements(movements: PushedMovement[]): Promise<{ results: Array<{ movementId: string; status: 'ok' | 'error'; duplicate?: boolean; error?: string }> }> {
  const res = await deviceFetch('/api/v1/inventory/movements', { method: 'POST', body: JSON.stringify({ movements }) });
  const data = await parseJsonResponse(res);
  if (!res.ok) throw new CloudApiError(data?.message ?? `Inventory movement push failed (${res.status})`, res.status);
  return data;
}

export async function pullInventoryMovements(afterSeq: number): Promise<{ movements: RemoteMovement[]; latestSeq: number; hasMore: boolean }> {
  const res = await deviceFetch(`/api/v1/inventory/movements?afterSeq=${afterSeq}`);
  const data = await parseJsonResponse(res);
  if (!res.ok) throw new CloudApiError(data?.message ?? `Inventory movement pull failed (${res.status})`, res.status);
  return data;
}

export interface SyncIssue {
  code: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
  entityType: string;
  entityId?: string;
  detail?: string;
}

export interface FleetDevice {
  id: string;
  type: string;
  name: string | null;
  health: string;
  appVersion: string | null;
  pendingSyncCount: number | null;
  syncError: string | null;
  menuVersion: number | null;
  menuStatus: 'none' | 'current' | 'behind';
}

async function jsonOrThrowCloud<T>(res: Response, what: string): Promise<T> {
  const data = await parseJsonResponse(res);
  if (!res.ok) throw new CloudApiError(data?.message ?? `${what} failed (${res.status})`, res.status);
  return data as T;
}

export async function fetchSyncIssues(): Promise<SyncIssue[]> {
  return (await jsonOrThrowCloud<{ issues: SyncIssue[] }>(await deviceFetch('/api/v1/devices/me/sync-issues'), 'Sync issues')).issues;
}

export async function fetchDeviceFleet(): Promise<FleetDevice[]> {
  return (await jsonOrThrowCloud<{ devices: FleetDevice[] }>(await deviceFetch('/api/v1/devices/me/fleet'), 'Device fleet')).devices;
}

export async function fetchMenuVersion(): Promise<{ version: number; watermark: string | null }> {
  return jsonOrThrowCloud(await deviceFetch('/api/v1/menu/version'), 'Menu version');
}

export interface MenuDraftStatus {
  publishedVersion: number;
  hasUnpublishedChanges: boolean;
  errors: string[];
  warnings: string[];
  counts: { categories: number; items: number; modifierGroups: number };
}

/** What guests see today versus what is being edited, and what would block or be hidden if published now. */
export async function fetchMenuDraftStatus(): Promise<MenuDraftStatus> {
  return jsonOrThrowCloud(await deviceFetch('/api/v1/menu/draft-status'), 'Menu status');
}

export class MenuPublishRefused extends Error {
  constructor(message: string, public errors: string[]) {
    super(message);
  }
}

/**
 * Publishes the menu to guests: first sends this console's unsent menu edits, then asks the cloud to freeze them as a new
 * numbered version. Says so plainly when the edits could not be delivered or the menu has problems that block publishing.
 */
export async function publishMenuToGuests(note?: string): Promise<{ version: number; warnings: string[] }> {
  const sent = await publishCatalogNow();
  if (!sent.delivered) throw new CloudApiError(`${sent.pending} menu change(s) have not reached the cloud yet. Check your connection and try again.`, 0);
  const res = await deviceFetch('/api/v1/menu/publish', { method: 'POST', body: JSON.stringify({ note }) });
  const data = await parseJsonResponse(res);
  if (res.status === 422) throw new MenuPublishRefused(data?.message ?? 'The menu has problems that must be fixed first', Array.isArray(data?.errors) ? data.errors : []);
  if (!res.ok) throw new CloudApiError(data?.message ?? `Menu publish failed (${res.status})`, res.status);
  return { version: data.version, warnings: Array.isArray(data.warnings) ? data.warnings : [] };
}

export async function publishMenu(note?: string): Promise<{ version: number }> {
  return jsonOrThrowCloud(await deviceFetch('/api/v1/menu/publish', { method: 'POST', body: JSON.stringify({ note }) }), 'Menu publish');
}

/** A JSON call to the cloud as this Restaurant Admin console (its device credential). Throws CloudApiError with the server's own message. */
export async function qrApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  return jsonOrThrowCloud<T>(await deviceFetch(path, init), 'QR ordering');
}

/** First-time activation: the Restaurant ID, the owner's email, the invitation token from the welcome email, and the password they choose. */
export async function cloudActivateOwner(input: { restaurantCode: string; email: string; activationToken: string; newPassword: string }): Promise<void> {
  await request('/api/v1/tenant-auth/activate-owner', { method: 'POST', body: input, skipAuthRetry: true });
}

/** Signed-in owner changes their own password. */
export async function cloudChangeOwnerPassword(currentPassword: string, newPassword: string): Promise<void> {
  await request('/api/v1/tenant/me/password', { method: 'PATCH', body: { currentPassword, newPassword } });
}

// --- Payment Connection (self-service online payments) ---

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
  gst?: string | null;
  cin?: string | null;
  uidai?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  settlementAccountName?: string | null;
  settlementIfsc?: string | null;
  settlementUpiVpa?: string | null;
  bankVerificationStatus?: 'NOT_ADDED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
}

export async function getPaymentConnection(): Promise<PaymentConnectionStatus> {
  return request<PaymentConnectionStatus>('/api/v1/tenant/payment-connection', { method: 'GET' });
}

export async function submitPaymentConnection(fields: PaymentConnectionFields): Promise<PaymentConnectionStatus> {
  // The form always holds every field, including optional ones the admin cleared back to ''.
  // The API's optional string fields carry .min(1), so an empty string is a 400 — omit them.
  const cleaned = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== '')) as PaymentConnectionFields;
  return request<PaymentConnectionStatus>('/api/v1/tenant/payment-connection', { method: 'POST', body: cleaned });
}

// --- Online payments dashboard (ported from kiosk-admin; device-authed via the existing
// signedDeviceFetch/POS_ADMIN signing this file already has for getPaymentsSummary) ---

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
  razorpayFee: number;
  platformNetCommission: number;
  commissionReversed: number;
  restaurantGross: number;
  restaurantRefundImpact: number;
  netPayableToRestaurant: number;
  settlementNote: string;
  rows: Array<{ id: string; externalOrderId: string; amount: number; platformAmount: number; restaurantAmount: number; method: string | null; paidAt: string | null }>;
  rowsTruncated: boolean;
}

export interface PayoutSummary {
  grossCollection: number;
  platformFee: number;
  netPayable: number;
  pendingPayout: number;
  paidPayout: number;
}

export interface RestaurantPayout {
  id: string;
  businessDate: string;
  status: 'PENDING' | 'APPROVED' | 'PROCESSING' | 'PAID' | 'ON_HOLD' | 'FAILED';
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  paymentCount: number;
  bankAccountMasked: string | null;
  bankIfsc: string | null;
  utr: string | null;
  paidAt: string | null;
  holdReason: string | null;
  createdAt: string;
}

async function signedJsonOrThrow<T>(res: Response, what: string): Promise<T> {
  const data = await parseJsonResponse(res);
  if (!res.ok) throw new CloudApiError(data?.message ?? `${what} failed (${res.status})`, res.status);
  return data as T;
}

export async function getRecentPayments(): Promise<RecentPayment[]> {
  const data = await signedJsonOrThrow<{ rows: RecentPayment[] }>(await signedDeviceFetch('/api/v1/payments/tenant-recent'), 'Recent payments');
  return data.rows;
}

/** A paid order the kiosk never produced a ticket for, marked as handled by staff. */
export async function markPaymentHandled(paymentId: string): Promise<void> {
  await signedJsonOrThrow(await signedDeviceFetch(`/api/v1/payments/${paymentId}/fulfilled`, { method: 'POST' }), 'Mark payment handled');
}

export async function getDayStatement(date: string): Promise<DayStatement> {
  return signedJsonOrThrow<DayStatement>(await signedDeviceFetch(`/api/v1/payments/tenant-statement?date=${encodeURIComponent(date)}`), 'Day statement');
}

/**
 * Lifetime gross collection / Jamanvaar fee / net payable, and how much of that net is still pending vs
 * already paid out by bank transfer. Temporary manual-payout view while Razorpay Route is pending — see
 * RestaurantPayoutsService on the server for the batching rules. All amounts in paise.
 */
export async function getPayoutSummary(): Promise<PayoutSummary> {
  return signedJsonOrThrow<PayoutSummary>(await signedDeviceFetch('/api/v1/payments/payout-summary'), 'Payout summary');
}

export async function getPayoutHistory(page = 1, limit = 25): Promise<{ rows: RestaurantPayout[]; total: number; page: number; limit: number }> {
  return signedJsonOrThrow(await signedDeviceFetch(`/api/v1/payments/payout-history?page=${page}&limit=${limit}`), 'Payout history');
}
