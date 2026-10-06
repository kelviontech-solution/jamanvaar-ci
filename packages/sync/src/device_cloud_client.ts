/**
 * The device-to-cloud request layer shared by the POS, KDS and Captain apps.
 *
 * Each app used to carry its own copy of these functions, differing only in the localStorage key prefix and a
 * few app-specific extras (activation side effects, payments, AI). The factory holds the identical part;
 * each app's cloudClient.ts keeps its own activation/extras and re-exports what the factory returns.
 */

import { EndpointResolver } from './endpoint_resolver';
import { sendHeartbeat } from './heartbeat';
import { pullRestaurantIdentity } from './restaurant_identity';
import { orderSyncPullQuery } from './sync_protocol';
import type { OrderSyncPushEvent, OrderSyncPushResult, CloudSyncedOrder } from './outbox';
import type { EntitySyncEvent, EntitySyncPushResult, CloudSyncedEntity } from './entity_sync';

export class CloudApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export type NumberLeaseKind = 'ORDER' | 'KOT';

export interface NumberLease {
  kind: NumberLeaseKind;
  prefix: string;
  businessDate: string;
  start: number;
  count: number;
}

export interface DeviceCloudClientOptions {
  /** Storage key prefix, e.g. `jamanvaar_pos`; keys are `<prefix>_restaurant_id`, `_device_id`, `_device_token`. */
  keyPrefix: string;
  apiBase: string;
  appVersion: string;
  /** Runs before each heartbeat is sent (fire-and-forget); used by apps that refresh extra config. */
  onBeforeHeartbeat?: (ctx: { apiBase: string; deviceToken: string; restaurantId: string | null; deviceId: string | null }) => void;
}

/** Parses a JSON body (undefined when the response is not JSON) and tags objects with the server that answered. */
export async function parseJsonResponse(res: Response): Promise<any> {
  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await res.json() : undefined;
  if (data && typeof data === 'object' && !Array.isArray(data)) data.serverKey = EndpointResolver.responderFor(res);
  return data;
}

/** Query string for an entity-sync pull: a `seq:` cursor, a timestamp, or from the beginning. */
export function entitySyncPullQuery(since?: string): string {
  if (since?.startsWith('seq:')) return `?afterSeq=${encodeURIComponent(since.slice(4))}`;
  return since ? `?since=${encodeURIComponent(since)}` : '?afterSeq=0';
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function createDeviceCloudClient(options: DeviceCloudClientOptions) {
  const { apiBase, appVersion, onBeforeHeartbeat } = options;
  const RESTAURANT_ID_KEY = `${options.keyPrefix}_restaurant_id`;
  const DEVICE_ID_KEY = `${options.keyPrefix}_device_id`;
  const DEVICE_TOKEN_KEY = `${options.keyPrefix}_device_token`;

  const getDeviceToken = () => readStorage(DEVICE_TOKEN_KEY);
  const getRestaurantId = () => readStorage(RESTAURANT_ID_KEY);

  function deviceFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const token = getDeviceToken();
    if (!token) return Promise.reject(new CloudApiError('Device not activated', 401));
    return EndpointResolver.fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) }
    });
  }

  async function request(path: string, failure: string, init?: RequestInit): Promise<any> {
    const res = await deviceFetch(path, init);
    const data = await parseJsonResponse(res);
    if (!res.ok) throw new CloudApiError(data?.message ?? `${failure} (${res.status})`, res.status);
    return data;
  }

  return {
    keys: { restaurantId: RESTAURANT_ID_KEY, deviceId: DEVICE_ID_KEY, deviceToken: DEVICE_TOKEN_KEY },
    isDeviceConnected: (): boolean => {
      try {
        return localStorage.getItem(DEVICE_TOKEN_KEY) !== null;
      } catch {
        return false;
      }
    },
    getDeviceToken,
    getRestaurantId,
    deviceFetch,

    pushOrderSync: (events: OrderSyncPushEvent[]): Promise<{ results: OrderSyncPushResult[]; serverTime: string }> =>
      request('/api/v1/orders/sync', 'Order sync push failed', { method: 'POST', body: JSON.stringify({ events }) }),

    pullOrderSync: (
      cursor?: string
    ): Promise<{ orders: CloudSyncedOrder[]; serverTime: string; latestSeq?: number; hasMore?: boolean; serverKey?: 'cloud' | 'core' }> =>
      request(`/api/v1/orders/sync${orderSyncPullQuery(cursor)}`, 'Order sync pull failed'),

    pushEntitySync: (entityType: string, events: EntitySyncEvent[]): Promise<{ results: EntitySyncPushResult[]; serverTime: string }> =>
      request(`/api/v1/entity-sync/${entityType}`, 'Entity sync push failed', { method: 'POST', body: JSON.stringify({ events }) }),

    pullEntitySync: (
      entityType: string,
      since?: string
    ): Promise<{ entities: CloudSyncedEntity[]; serverTime: string; latestSeq?: number; hasMore?: boolean; serverKey?: 'cloud' | 'core' }> =>
      request(`/api/v1/entity-sync/${entityType}${entitySyncPullQuery(since)}`, 'Entity sync pull failed'),

    async reportHeartbeat(): Promise<void> {
      const deviceToken = localStorage.getItem(DEVICE_TOKEN_KEY);
      if (!deviceToken) return;
      const restaurantId = localStorage.getItem(RESTAURANT_ID_KEY);
      const deviceId = localStorage.getItem(DEVICE_ID_KEY);
      onBeforeHeartbeat?.({ apiBase, deviceToken, restaurantId, deviceId });
      // Real version, OS and sync backlog; also applies the answer: lock, notice, update offer, offline extension.
      await sendHeartbeat({ apiBase, deviceToken, appVersion, restaurantId, deviceId });
    },

    /** Picks up a restaurant-identity edit made on another device (or by Super Admin). */
    async syncRestaurantIdentity(): Promise<void> {
      const deviceToken = localStorage.getItem(DEVICE_TOKEN_KEY);
      const restaurantId = localStorage.getItem(RESTAURANT_ID_KEY);
      if (!deviceToken || !restaurantId) return;
      await pullRestaurantIdentity({ apiBase, deviceToken, restaurantId });
    },

    /** Reserves a block of human order/KOT numbers for this device so offline terminals never issue the same number. */
    async leaseNumberBlock(kind: NumberLeaseKind, count: number): Promise<NumberLease> {
      const res = await deviceFetch('/api/v1/sync/number-leases', { method: 'POST', body: JSON.stringify({ kind, count }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.message) || `Number lease failed (${res.status})`);
      return data;
    }
  };
}
