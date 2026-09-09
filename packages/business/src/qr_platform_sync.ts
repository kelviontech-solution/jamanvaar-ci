import { LicenseRepository, QrOrderingRepository } from '@jamanvaar/database';
import type { LicenseInfo, PlatformQrControl, QrUsageSnapshot } from '@jamanvaar/types';

/**
 * Closes the QR entitlement loop between the platform and this restaurant.
 *
 *   Super Admin toggles QR ordering  ->  cloud/api PlatformSetting
 *      -> pullQrPlatformControl()    ->  local license.platformQrControl
 *      -> QrOrderingRepository.verifyQrToken enforces it on every guest scan
 *
 *   Real orders in the shared order engine
 *      -> pushQrUsage()              ->  cloud/api PlatformSetting
 *      -> Super Admin QR dashboard shows measured usage (not an estimate)
 *
 * Offline behaviour is deliberate. The POS is offline-first, so a failed sync
 * must not change what the restaurant is allowed to do: the last successfully
 * synced control block stays in force, and usage is simply reported later.
 * We never fail open (inventing permission the platform did not grant) and
 * never fail closed (cutting off a paying restaurant because its link dropped).
 */

/** Shape returned by GET /api/v1/tenant/qr-ordering/entitlement. */
export interface QrEntitlementResponse {
  qrEntitled: boolean;
  qrOrderingEnabled: boolean;
  maxActiveTables: number;
  maxOrdersPerDay: number | null;
  digitalMenu: boolean;
  guestCustomization: boolean;
  liveOrderTracking: boolean;
  qrAnalytics: boolean;
  onlinePayments: boolean;
  source: 'PLAN' | 'PLATFORM_OVERRIDE';
}

export type QrPullResult =
  | { ok: true; license: LicenseInfo; control: PlatformQrControl }
  | { ok: false; reason: 'unreachable' | 'unauthorized' | 'malformed'; detail?: string };

export type QrPushResult =
  | { ok: true; reported: QrUsageSnapshot }
  | { ok: false; reason: 'unreachable' | 'unauthorized'; detail?: string; pending: QrUsageSnapshot };

export interface QrSyncOptions {
  /** Base URL of cloud/api, e.g. https://cloud.jamanvaar.com */
  baseUrl: string;
  /** Bearer token for the authenticated tenant session. */
  accessToken: string;
  fetchImpl?: typeof fetch;
}

const TENANT_QR_BASE = '/api/v1/tenant/qr-ordering';

function isBooleanField(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Validates the platform's response before it is allowed anywhere near the
 * license. A malformed payload is rejected outright rather than coerced --
 * a half-understood entitlement is worse than the last known good one.
 */
function parseEntitlement(body: unknown): QrEntitlementResponse | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  const booleans = [
    'qrEntitled',
    'qrOrderingEnabled',
    'digitalMenu',
    'guestCustomization',
    'liveOrderTracking',
    'qrAnalytics',
    'onlinePayments'
  ] as const;
  for (const key of booleans) {
    if (!isBooleanField(b[key])) return null;
  }

  if (typeof b.maxActiveTables !== 'number' || !Number.isFinite(b.maxActiveTables) || b.maxActiveTables < 0) {
    return null;
  }
  if (
    b.maxOrdersPerDay !== null &&
    (typeof b.maxOrdersPerDay !== 'number' || !Number.isFinite(b.maxOrdersPerDay) || b.maxOrdersPerDay < 0)
  ) {
    return null;
  }
  if (b.source !== 'PLAN' && b.source !== 'PLATFORM_OVERRIDE') return null;

  return b as unknown as QrEntitlementResponse;
}

/**
 * Fetches the platform's current QR entitlement for THIS restaurant and records
 * it locally. The restaurant is identified by the access token alone -- no
 * restaurantId is sent, so a tenant cannot ask about anyone else's entitlement.
 */
export async function pullQrPlatformControl(options: QrSyncOptions): Promise<QrPullResult> {
  const doFetch = options.fetchImpl || fetch;

  let response: Response;
  try {
    response = await doFetch(`${options.baseUrl}${TENANT_QR_BASE}/entitlement`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        Accept: 'application/json'
      }
    });
  } catch (err) {
    return { ok: false, reason: 'unreachable', detail: err instanceof Error ? err.message : String(err) };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: 'unauthorized' };
  }
  if (!response.ok) {
    return { ok: false, reason: 'unreachable', detail: `HTTP ${response.status}` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: 'malformed', detail: 'response was not valid JSON' };
  }

  const entitlement = parseEntitlement(body);
  if (!entitlement) {
    return { ok: false, reason: 'malformed', detail: 'entitlement payload failed validation' };
  }

  // An unentitled restaurant is the same as a disabled one at the guest scan:
  // both mean "do not serve QR orders right now".
  const license = LicenseRepository.applyPlatformQrControl(
    {
      qrOrderingEnabled: entitlement.qrEntitled && entitlement.qrOrderingEnabled,
      maxActiveTables: entitlement.maxActiveTables,
      maxOrdersPerDay: entitlement.maxOrdersPerDay,
      digitalMenu: entitlement.digitalMenu,
      guestCustomization: entitlement.guestCustomization,
      liveOrderTracking: entitlement.liveOrderTracking,
      qrAnalytics: entitlement.qrAnalytics,
      onlinePayments: entitlement.onlinePayments
    },
    { source: 'cloud-sync' }
  );

  return { ok: true, license, control: license.platformQrControl! };
}

/**
 * Reports this restaurant's measured QR usage to the platform. The figures are
 * counted from the shared order engine by QrOrderingRepository, so what the
 * Super Admin dashboard shows is what actually happened.
 *
 * On failure the snapshot comes back as `pending` so the caller's sync queue can
 * retry it; nothing is lost and nothing is fabricated in the meantime.
 */
export async function pushQrUsage(options: QrSyncOptions): Promise<QrPushResult> {
  const doFetch = options.fetchImpl || fetch;
  const snapshot = QrOrderingRepository.getQrUsageSnapshot();

  let response: Response;
  try {
    response = await doFetch(`${options.baseUrl}${TENANT_QR_BASE}/usage`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        activeTables: snapshot.activeTables,
        ordersToday: snapshot.ordersToday,
        revenueToday: snapshot.revenueToday
      })
    });
  } catch (err) {
    return {
      ok: false,
      reason: 'unreachable',
      detail: err instanceof Error ? err.message : String(err),
      pending: snapshot
    };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: 'unauthorized', pending: snapshot };
  }
  if (!response.ok) {
    return { ok: false, reason: 'unreachable', detail: `HTTP ${response.status}`, pending: snapshot };
  }

  return { ok: true, reported: snapshot };
}

/**
 * One round trip: take the platform's current rules, then report what we did.
 * Pull first so that a restaurant just switched off stops serving guests as
 * early as possible in the cycle.
 */
export async function syncQrPlatformState(
  options: QrSyncOptions
): Promise<{ pull: QrPullResult; push: QrPushResult }> {
  const pull = await pullQrPlatformControl(options);
  const push = await pushQrUsage(options);
  return { pull, push };
}
