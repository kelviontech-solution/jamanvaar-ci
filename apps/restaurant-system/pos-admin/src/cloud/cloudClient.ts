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

/** Step 2: the owner logs in with the credentials Super Admin (or a prior session) set up. */
export async function cloudLogin(
  email: string,
  password: string
): Promise<{ id: string; fullName: string; role: string; restaurantId: string }> {
  const restaurantId = getRestaurantId();
  if (!restaurantId) {
    throw new CloudApiError('Not connected — enter an activation code first', 400);
  }
  const result = await request<{
    accessToken: string;
    user: { id: string; fullName: string; role: string; restaurantId: string };
  }>('/api/v1/tenant-auth/login', {
    method: 'POST',
    body: { restaurantId, email, password }
  });
  accessToken = result.accessToken;
  return result.user;
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
