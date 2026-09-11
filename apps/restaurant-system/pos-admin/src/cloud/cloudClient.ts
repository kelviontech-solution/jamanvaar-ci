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

const API_BASE = import.meta.env.VITE_CLOUD_API_BASE_URL ?? 'http://localhost:4000';

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

export interface CloudEntitlementsResponse {
  subscriptionStatus: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'EXPIRED' | null;
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

function getRestaurantId(): string | null {
  try {
    return localStorage.getItem(RESTAURANT_ID_KEY);
  } catch {
    return null;
  }
}

function setRestaurantId(id: string) {
  try {
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
    localStorage.setItem(RESTAURANT_ID_KEY, restaurantId);
  } catch {
    // Storage unavailable
  }
}

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
  const res = await fetch(`${API_BASE}${path}`, {
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
    throw new CloudApiError(data?.message ?? `Request failed (${res.status})`, res.status);
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
  restaurant: { id: string; name: string };
  deviceId?: string;
}

export interface CloudAuthActivationRequired {
  requiresActivation: true;
  activationSessionToken: string;
  restaurant: { id: string; name: string };
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
        restaurant: { id: string; name: string };
        deviceId?: string;
        deviceToken?: string;
      }
    | {
        status: 'ACTIVATION_REQUIRED';
        requiresActivation: true;
        activationSessionToken: string;
        restaurant: { id: string; name: string };
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
      deviceType: 'POS_ADMIN'
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
 * Redeems an activation key for this authenticated session, binds the device in PostgreSQL,
 * and sets up persistent device credentials so future logins do not ask for activation.
 */
export async function cloudActivateDevice(
  activationSessionToken: string,
  activationKey: string
): Promise<{
  user: { id: string; fullName: string; role: string; restaurantId: string; email: string };
  restaurant: { id: string; name: string };
  deviceId: string;
}> {
  const result = await request<{
    status: 'LOGIN_SUCCESS';
    requiresActivation: false;
    accessToken: string;
    user: { id: string; fullName: string; role: string; restaurantId: string; email: string };
    restaurant: { id: string; name: string };
    deviceId: string;
    deviceToken: string;
  }>('/api/v1/tenant-auth/activate-device', {
    method: 'POST',
    body: {
      activationSessionToken,
      activationKey,
      deviceType: 'POS_ADMIN',
      deviceName: 'Restaurant Admin Console'
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

export function cloudLogout() {
  accessToken = null;
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

/**
 * The refund endpoint is device-authed, not session-authed like request<T>()
 * above (which sends the owner-login accessToken) — so this bypasses
 * request<T>() and sends the device token this app already has from its own
 * existing activation flow instead.
 */
export async function createRefund(paymentId: string, amountPaise: number, reason: string): Promise<{ refundId: string; providerRefundId: string; status: string; amount: number }> {
  const token = getStoredDeviceToken();
  if (!token) throw new CloudApiError('Device not activated', 401);

  const res = await fetch(`${API_BASE}/api/v1/payments/${paymentId}/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ amountPaise, reason })
  });
  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await res.json() : undefined;
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Refund failed (${res.status})`, res.status);
  }
  return data;
}


