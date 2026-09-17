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

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable — the next pull just re-uses the default lookback window.
  }
}

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
    const cursorKey = `jamanvaar_entity_sync_cursor_${entityType}`;
    const since = safeGet(cursorKey) ?? undefined;

    try {
      const { entities, serverTime } = await this.transport.pull(entityType, since);
      entities.forEach(onEntity);
      safeSet(cursorKey, serverTime);
      return { pulled: entities.length };
    } catch {
      return { pulled: 0 };
    }
  }
}
