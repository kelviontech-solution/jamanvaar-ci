import { RestaurantIdentityRepository } from '@jamanvaar/database';
import { DeviceGate } from './device_gate';

/** What Restaurant Admin's Settings screen may push — every field is optional there. */
export interface RestaurantIdentityFields {
  name?: string;
  legalName?: string | null;
  gstin?: string | null;
  fssaiNumber?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  /** The owner's "Show JAMAN AI Assistant" choice; every terminal follows it. */
  showJamanAI?: boolean;
}

/** What the cloud always returns for a GET — `name` is a required column, never absent. */
interface RestaurantIdentityResponse extends RestaurantIdentityFields {
  name: string;
}

/**
 * B2-054: the restaurant's own legal/registration details (name, GSTIN, FSSAI, address, city,
 * state) never reached any device except the one Restaurant Admin happened to log into — every
 * other terminal (POS, Captain, KDS, both kiosk apps) kept whatever it got at activation forever,
 * and an owner's edit from Super Admin's side, or from Restaurant Admin's own Settings, never
 * reached the cloud or any other device at all. This is the pull half: every terminal calls it
 * on the same cadence as its heartbeat, and merges the result the same safe way login already
 * does (RestaurantIdentityRepository.syncProfile — a detail the owner typed by hand is never
 * overwritten, only a blank or still-demo value is replaced).
 */
export async function pullRestaurantIdentity(opts: { apiBase: string; deviceToken: string; restaurantId: string }): Promise<void> {
  try {
    const res = await DeviceGate.gatedFetch(`${opts.apiBase}/api/v1/devices/me/restaurant`, {
      headers: { Authorization: `Bearer ${opts.deviceToken}` }
    });
    if (!res.ok) return;
    const data = (await res.json()) as RestaurantIdentityResponse;
    RestaurantIdentityRepository.syncProfile({ id: opts.restaurantId, ...data });
  } catch {
    // Best-effort: retried on the next tick.
  }
}

/**
 * B2-054: the push half — Restaurant Admin's Settings screen is the only place an owner edits
 * these fields, so it is the only caller. Sent before the pull above so a rename or address
 * correction saved on this device is not overwritten by the copy the cloud still had.
 */
export async function pushRestaurantIdentity(opts: { apiBase: string; deviceToken: string; identity: RestaurantIdentityFields; requireAcknowledgement?: boolean }): Promise<void> {
  try {
    const response = await DeviceGate.gatedFetch(`${opts.apiBase}/api/v1/devices/me/restaurant`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.deviceToken}` },
      body: JSON.stringify(opts.identity)
    });
    if (!response.ok && opts.requireAcknowledgement) throw new Error('Restaurant settings could not be saved to the server.');
  } catch (error) {
    if (opts.requireAcknowledgement) throw error;
    // Best-effort: the next Settings save (or the periodic pull, once another device's edit lands) retries.
  }
}
