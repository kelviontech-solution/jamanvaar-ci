import { AiConfig, refreshAiConfigIfStale, reportAiQuery } from '@jamanvaar/business';
import { KeyValueStore } from '@jamanvaar/database';
import { stopRealtime } from '@jamanvaar/sync';
import { fetchWithDeadline, withSessionLock } from '@jamanvaar/api';
/**
 * KDS's only connection to cloud/api. Same pattern as pos/src/cloud/cloudClient.ts:
 * a single activation-key redeem call gets a device token, used as a Bearer
 * credential for every request after that. KDS mostly pulls (it needs to see
 * orders created elsewhere), but pushes too — a chef marking a ticket READY
 * on this terminal needs to reach POS/Captain the same way an order reaching
 * this terminal does.
 */

import { DeviceGate, EndpointResolver, CloudApiError, parseJsonResponse, createDeviceCloudClient, getDevicePublicKeyJwk } from '@jamanvaar/sync';
import { MenuRepository, RestaurantIdentityRepository, TenantIsolation } from '@jamanvaar/database';

const API_BASE = import.meta.env.VITE_CLOUD_API_BASE_URL ?? 'http://localhost:4000';
// Operational traffic goes to the restaurant's Branch Core when one is configured and reachable; the cloud otherwise.
EndpointResolver.setTransport((url, init) => DeviceGate.gatedFetch(url, init));
EndpointResolver.configure({ cloudBase: API_BASE, coreUrl: import.meta.env.VITE_BRANCH_CORE_URL });

const client = createDeviceCloudClient({
  keyPrefix: 'jamanvaar_kds',
  apiBase: API_BASE,
  appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0',
  onBeforeHeartbeat: ({ apiBase, deviceToken }) => void refreshAiConfigIfStale({ apiBase, deviceToken })
});
const { restaurantId: RESTAURANT_ID_KEY, deviceId: DEVICE_ID_KEY, deviceToken: DEVICE_TOKEN_KEY } = client.keys;

export { CloudApiError };

export const isKdsDeviceConnected = client.isDeviceConnected;

/**
 * Unbinds this terminal (BUG-145 follow-up): a device the cloud no longer recognises, or has revoked, was
 * stuck forever behind the lock screen with no way back to activation. Clears the saved restaurant id and
 * device credential and forgets the lock state, so the app falls back to asking for a fresh activation key.
 */
export function resetTerminal(): void {
  AiConfig.reset();
  stopRealtime();
  try {
    localStorage.removeItem(RESTAURANT_ID_KEY);
    localStorage.removeItem(DEVICE_ID_KEY);
    localStorage.removeItem(DEVICE_TOKEN_KEY);
  } catch {
    // Storage unavailable - nothing to clear, but the gate reset below still lets a reload retry cleanly.
  }
  DeviceGate.reset();
}

export async function activateKdsDevice(code: string): Promise<void> {
  // Generated (or loaded, if this profile already has one) before the request, so the server can bind the device
  // to it from the very first activation — see @jamanvaar/sync's device_identity.ts.
  const publicKeyJwk = await getDevicePublicKeyJwk('KDS').catch(() => null);
  const res = await fetchWithDeadline(`${API_BASE}/api/v1/activation/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim(), deviceType: 'KDS', appVersion: '1.0.0', ...(publicKeyJwk ? { publicKeyJwk } : {}) })
  });

  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Activation failed (${res.status})`, res.status);
  }

  try {
    TenantIsolation.enter(data.restaurantId);
    KeyValueStore.set('jamanvaar_bound_branch_id', data.device?.branchId ?? ''); // a different restaurant's local data is never carried over
    localStorage.setItem(RESTAURANT_ID_KEY, data.restaurantId);
    // BUG-021: this device used to keep showing the seeded "JAMANVAAR RESTAURANT" placeholder
    // forever, even after activating against a real restaurant with a different name.
    if (data.restaurant) {
      RestaurantIdentityRepository.adopt(data.restaurantId, data.restaurant);
    }
    localStorage.setItem(DEVICE_ID_KEY, data.device.id);
    localStorage.setItem(DEVICE_TOKEN_KEY, data.deviceToken);
    DeviceGate.reportSuccess(); // a fresh activation starts unlocked
    MenuRepository.startFreshMenu(); // BUG-013: a real restaurant starts with no menu until one is uploaded
    RestaurantIdentityRepository.startFreshOperations(); // BUG-115: ...and no demo combos, coupons, offers or tables
  } catch {
    // Storage unavailable — activation succeeded server-side, this terminal just won't remember it across reloads.
  }
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

export async function reportAiQueryNow(intent: string, latencyMs: number): Promise<void> {
  const deviceToken = client.getDeviceToken();
  if (deviceToken) await reportAiQuery({ apiBase: API_BASE, deviceToken, intent, latencyMs });
}
