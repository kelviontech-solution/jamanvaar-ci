import { KeyValueStore } from '@jamanvaar/database';
import { stopRealtime } from '@jamanvaar/sync';
import { fetchWithDeadline, withSessionLock } from '@jamanvaar/api';
/**
 * Captain's only connection to cloud/api — owner-issued login id + password,
 * not a separate activation code (mirrors pos-admin's cloudLogin/cloudActivateDevice
 * two-step: cloud/api's /tenant-auth/login always requires a Welcome Kit
 * activation key the first time any given physical device connects, then
 * remembers this device's token for every login after that). Day-to-day
 * staff auth stays the fast local PIN keypad in App.tsx — this only runs
 * once per tablet.
 */

import { refreshAiConfigIfStale, reportAiQuery } from '@jamanvaar/business';
import { DeviceGate, EndpointResolver, CloudApiError, parseJsonResponse, createDeviceCloudClient, getDevicePublicKeyJwk } from '@jamanvaar/sync';
import { MenuRepository, RestaurantIdentityRepository, TenantIsolation } from '@jamanvaar/database';

const API_BASE = import.meta.env.VITE_CLOUD_API_BASE_URL ?? 'http://localhost:4000';
// Operational traffic goes to the restaurant's Branch Core when one is configured and reachable; the cloud otherwise.
EndpointResolver.setTransport((url, init) => DeviceGate.gatedFetch(url, init));
EndpointResolver.configure({ cloudBase: API_BASE, coreUrl: import.meta.env.VITE_BRANCH_CORE_URL });

const client = createDeviceCloudClient({
  keyPrefix: 'jamanvaar_captain',
  apiBase: API_BASE,
  appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0',
  // The platform's decision about JAMAN AI for this restaurant rides on the heartbeat (cached 5 minutes).
  onBeforeHeartbeat: ({ apiBase, deviceToken }) => void refreshAiConfigIfStale({ apiBase, deviceToken })
});
const { restaurantId: RESTAURANT_ID_KEY, deviceId: DEVICE_ID_KEY, deviceToken: DEVICE_TOKEN_KEY } = client.keys;
const DEVICE_LABEL_KEY = 'jamanvaar_captain_device_label';

export { CloudApiError };

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
 * the whole connect screen) is gated on `RESTAURANT_ID_KEY`, not the device token. Clearing it, along with
 * the device id/token and label, is what actually returns this tablet to the connect/activation screen.
 */
export function resetTerminal(): void {
  stopRealtime();
  try {
    localStorage.removeItem(RESTAURANT_ID_KEY);
    localStorage.removeItem(DEVICE_LABEL_KEY);
    localStorage.removeItem(DEVICE_ID_KEY);
    localStorage.removeItem(DEVICE_TOKEN_KEY);
  } catch {
    // Storage unavailable - nothing to clear, but the gate reset below still lets a reload retry cleanly.
  }
  DeviceGate.reset();
}

function persistConnection(restaurantId: string, label: string, deviceId?: string, deviceToken?: string, restaurantName?: string) {
  try {
    TenantIsolation.enter(restaurantId); // a different restaurant's local data is never carried over
    localStorage.setItem(RESTAURANT_ID_KEY, restaurantId);
    localStorage.setItem(DEVICE_LABEL_KEY, label);
    if (deviceId) localStorage.setItem(DEVICE_ID_KEY, deviceId);
    if (deviceToken) localStorage.setItem(DEVICE_TOKEN_KEY, deviceToken);
    DeviceGate.reportSuccess(); // a fresh activation starts unlocked
    MenuRepository.startFreshMenu(); // BUG-013: a real restaurant starts with no menu until one is uploaded
    RestaurantIdentityRepository.startFreshOperations(); // BUG-115: ...and no demo combos, coupons, offers or tables
    // BUG-021: this device used to keep showing the seeded "JAMANVAAR RESTAURANT" placeholder
    // forever, even after activating against a real restaurant with a different name.
    RestaurantIdentityRepository.adopt(restaurantId, { name: restaurantName });
  } catch {
    // Storage unavailable — connection won't persist across reloads, but this run keeps working.
  }
}

/**
 * Activates this tablet with the one activation key from the Super Admin Welcome Kit, the same way the POS and Kitchen Display do:
 * the key alone identifies the restaurant, so nothing else is asked.
 */
export async function activateCaptainWithKey(code: string): Promise<void> {
  // Generated (or loaded, if this profile already has one) before the request, so the server can bind the device
  // to it from the very first activation — see @jamanvaar/sync's device_identity.ts.
  const publicKeyJwk = await getDevicePublicKeyJwk('CAPTAIN').catch(() => null);
  const res = await fetchWithDeadline(`${API_BASE}/api/v1/activation/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim(), deviceType: 'CAPTAIN', appVersion: '1.0.0', ...(publicKeyJwk ? { publicKeyJwk } : {}) })
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Activation failed (${res.status})`, res.status);
  }
  KeyValueStore.set('jamanvaar_bound_branch_id', data.device?.branchId ?? '');
  persistConnection(data.restaurantId, data.device?.name ?? 'Captain Tablet', data.device?.id, data.deviceToken, data.restaurant?.name);
}

export const {
  deviceFetch,
  pushOrderSync,
  pullOrderSync,
  pushEntitySync,
  pullEntitySync,
  reportHeartbeat,
  syncRestaurantIdentity,
  leaseNumberBlock
} = client;

/** Tell the cloud a JAMAN AI question was answered (usage + measured latency) and honour its daily limit. */
export async function reportAiQueryNow(intent: string, latencyMs: number): Promise<void> {
  const deviceToken = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (!deviceToken) return;
  await reportAiQuery({ apiBase: API_BASE, deviceToken, intent, latencyMs });
}
