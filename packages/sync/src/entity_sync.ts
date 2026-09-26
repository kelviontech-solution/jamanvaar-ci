/**
 * The client half of cloud/api's generic entity-sync bridge (CRM/Inventory/
 * Payments-reporting) — see cloud/api/src/modules/entity-sync. Deliberately
 * simpler than SyncOutboxEngine's per-order dirty tracking: these domains
 * have no per-record syncStatus field on their local types (CustomerAccount,
 * InventoryItem), so this pushes a full current snapshot on each sync tick
 * rather than only-what-changed. For CRM/Inventory list sizes (tens to a few
 * hundred records per restaurant) that's a reasonable trade — cheap to
 * reason about, at the cost of more bytes over the wire than delta sync.
 */

export interface EntitySyncEvent {
  externalId: string;
  payload: Record<string, unknown>;
}

export interface EntitySyncPushResult {
  externalId: string;
  status: 'ok' | 'error';
  syncVersion?: number;
  error?: string;
}

export interface CloudSyncedEntity {
  externalId: string;
  payload: Record<string, unknown>;
  updatedAt: string;
}

export interface EntitySyncTransport {
  push(entityType: string, events: EntitySyncEvent[]): Promise<{ results: EntitySyncPushResult[]; serverTime: string }>;
  pull(entityType: string, since?: string): Promise<{ entities: CloudSyncedEntity[]; serverTime: string }>;
}

/** The server returns at most this many records per pull (see cloud/api entity-sync). */
const CATCH_UP_PAGE_SIZE = 500;

function safeGet(key: string): string | null {
  try {
    return KeyValueStore.get(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    KeyValueStore.set(key, value);
  } catch {
    // Storage unavailable — the next pull just re-uses the default lookback window.
  }
}

import { KeyValueStore } from '@jamanvaar/database';
import { EndpointResolver } from './endpoint_resolver';

export class EntitySyncEngine {
  private static transport: EntitySyncTransport | null = null;

  public static configureTransport(transport: EntitySyncTransport | null): void {
    this.transport = transport;
  }

  public static async pushSnapshot(entityType: string, records: EntitySyncEvent[]): Promise<{ processed: number; failed: number }> {
    if (!this.transport || records.length === 0) return { processed: 0, failed: 0 };
    try {
      const { results } = await this.transport.push(entityType, records);
      const processed = results.filter((r) => r.status === 'ok').length;
      return { processed, failed: results.length - processed };
    } catch {
      return { processed: 0, failed: records.length };
    }
  }

  /** Pulls everything changed since the last call and hands each record to `onEntity` to merge into local storage — the merge policy is domain-specific, so it stays with the caller. */
  public static async catchUp(entityType: string, onEntity: (entity: CloudSyncedEntity) => void): Promise<{ pulled: number }> {
    if (!this.transport) return { pulled: 0 };
    const cursorKey = EndpointResolver.cursorKey(`jamanvaar_entity_sync_cursor_${entityType}`, `/api/v1/entity-sync/${entityType}`);
    const predicted = EndpointResolver.serverKeyFor(`/api/v1/entity-sync/${entityType}`);
    // A device that has never pulled asks for everything, not just the last day: devices no longer re-upload
    // unchanged records every tick (BUG-149), so a menu untouched for a week must still reach a new terminal.
    const since = safeGet(cursorKey) ?? new Date(0).toISOString();

    try {
      const { entities, serverTime } = await this.transport.pull(entityType, since);
      entities.forEach(onEntity);
      if ((EndpointResolver.lastResponder() ?? predicted) !== predicted) return { pulled: entities.length }; // answered by the other server: its position is not ours
      // A full page means there may be more: continue from the last record received, not from "now", so
      // nothing beyond the page limit is skipped.
      const last = entities[entities.length - 1];
      const nextCursor = entities.length >= CATCH_UP_PAGE_SIZE && last?.updatedAt ? last.updatedAt : serverTime;
      safeSet(cursorKey, nextCursor);
      return { pulled: entities.length };
    } catch {
      return { pulled: 0 };
    }
  }
}
