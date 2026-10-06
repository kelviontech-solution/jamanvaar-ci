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
  pull(entityType: string, since?: string): Promise<{ entities: CloudSyncedEntity[]; serverTime: string; latestSeq?: number; hasMore?: boolean; serverKey?: 'cloud' | 'core' }>;
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

const CATALOG_TYPES = new Set(['MENU_CATEGORY', 'MENU_ITEM', 'MODIFIER_GROUP', 'TAX_GROUP']);
interface CatalogCheckpoint { version: 1; ids: string[]; complete: boolean }
function catalogCheckpoint(key: string): CatalogCheckpoint | null {
  try {
    const value = JSON.parse(safeGet(key + ':catalog_checkpoint') || 'null');
    return value?.version === 1 && Array.isArray(value.ids) && value.ids.every((id: unknown) => typeof id === 'string') ? value : null;
  } catch { return null; }
}

import { db, KeyValueStore } from '@jamanvaar/database';
import { EndpointResolver } from './endpoint_resolver';
import { jsonBatches } from './batches';

const restartedThisSession = new Set<string>();

export class EntitySyncEngine {
  private static transport: EntitySyncTransport | null = null;
  private static readonly pulls = new Map<string, Promise<{ pulled: number }>>();
  private static readonly wakeUps = new Map<string, () => Promise<unknown>>();
  private static readonly consumers = new Map<string, (entity: CloudSyncedEntity) => void>();

  static registerWakeUp(type: string, handler: () => Promise<unknown>): void { this.wakeUps.set(type, handler); }
  static wake(type?: string): void {
    for (const [kind, consumer] of this.consumers) {
      if (type && type !== kind) continue;
      const handler = this.wakeUps.get(kind);
      if (handler) void handler().catch(() => undefined);
      else void this.catchUp(kind, consumer);
    }
  }

  public static configureTransport(transport: EntitySyncTransport | null): void {
    this.transport = transport;
  }

  /** A cursor alone cannot prove that its local records survived a reload/storage race.
   * Upgrade existing partial caches once, and recover again only when a known record is missing. */
  public static ensureCatalogIntegrity(entityType: string, hasRecord: (id: string) => boolean): void {
    if (!this.transport || !CATALOG_TYPES.has(entityType)) return;
    const key = EndpointResolver.cursorKey(`jamanvaar_entity_sync_cursor_${entityType}`, `/api/v1/entity-sync/${entityType}`);
    if (this.pulls.has(key)) return;
    const checkpoint = catalogCheckpoint(key);
    if (checkpoint && (!checkpoint.complete || checkpoint.ids.every(hasRecord))) return;
    try { KeyValueStore.remove(key); KeyValueStore.remove(key + ':caught_up_at'); } catch {}
    safeSet(key + ':catalog_checkpoint', JSON.stringify({ version: 1, ids: [], complete: false }));
  }

  public static async pushSnapshot(entityType: string, records: EntitySyncEvent[]): Promise<{ processed: number; failed: number }> {
    if (!this.transport || records.length === 0) return { processed: 0, failed: 0 };
    let processed = 0;
    let failed = 0;
    const transport = this.transport;
    const scope = EndpointResolver.cursorKey(`entity-push-${entityType}`, `/api/v1/entity-sync/${entityType}`);
    let visited = 0;
    for (const batch of jsonBatches(records, 200, 15_000_000)) {
      if (transport !== this.transport || scope !== EndpointResolver.cursorKey(`entity-push-${entityType}`, `/api/v1/entity-sync/${entityType}`)) { failed += records.length - visited; break; }
      visited += batch.length;
      try {
        const { results } = await transport.push(entityType, batch);
        processed += results.filter((r) => r.status === 'ok').length;
        failed += batch.length - results.filter((r) => r.status === 'ok').length;
      } catch { failed += batch.length; }
    }
    return { processed, failed };
  }

  /**
   * Makes the next pull of this type ask for everything. A device that holds none of a kind of record but whose cursor sits
   * at "now" (its local copy was wiped, e.g. the tablet was activated again) would otherwise never receive what the cloud
   * already has.
   */
  public static restartFromBeginning(entityType: string): void {
    // Once per session: an owner who really has none of these records should not re-download the whole history every tick.
    if (restartedThisSession.has(entityType)) return;
    restartedThisSession.add(entityType);
    const cursorKey = EndpointResolver.cursorKey(`jamanvaar_entity_sync_cursor_${entityType}`, `/api/v1/entity-sync/${entityType}`);
    try {
      KeyValueStore.remove(cursorKey);
    } catch {
      // Storage unavailable: the next pull just uses whatever cursor it has.
    }
  }

  /** Pulls everything changed since the last call and hands each record to `onEntity` to merge into local storage — the merge policy is domain-specific, so it stays with the caller. */
  public static catchUp(entityType: string, onEntity: (entity: CloudSyncedEntity) => void): Promise<{ pulled: number }> {
    this.consumers.set(entityType, onEntity);
    const key = EndpointResolver.cursorKey(`jamanvaar_entity_sync_cursor_${entityType}`, `/api/v1/entity-sync/${entityType}`);
    const existing = this.pulls.get(key);
    if (existing) return existing;
    const run = this.pullPages(entityType, onEntity, key).finally(() => this.pulls.delete(key));
    this.pulls.set(key, run);
    return run;
  }

  private static async pullPages(entityType: string, onEntity: (entity: CloudSyncedEntity) => void, cursorKey: string): Promise<{ pulled: number }> {
    const transport = this.transport;
    if (!transport) return { pulled: 0 };
    const predicted = EndpointResolver.serverKeyFor(`/api/v1/entity-sync/${entityType}`);
    // Rebuild once when upgrading timestamp cursors; earlier timestamp gaps must also be recovered.
    const saved = safeGet(cursorKey);
    const upgradedKey = `${cursorKey}:sequence_protocol`;
    let cursor = saved?.startsWith('seq:') || safeGet(upgradedKey) ? saved ?? 'seq:0' : 'seq:0';
    let pulled = 0;
    const checkpoint = CATALOG_TYPES.has(entityType) ? catalogCheckpoint(cursorKey) : null;
    const knownIds = checkpoint ? new Set(checkpoint.ids) : null;
    try {
      for (let page = 0; page < 50; page++) {
        const result = await transport.pull(entityType, cursor);
        if (transport !== this.transport || cursorKey !== EndpointResolver.cursorKey(`jamanvaar_entity_sync_cursor_${entityType}`, `/api/v1/entity-sync/${entityType}`)) break;
        db.batch(() => result.entities.forEach(onEntity));
        pulled += result.entities.length;
        if ((result.serverKey ?? EndpointResolver.lastResponder() ?? predicted) !== predicted) break;
        if (knownIds) {
          for (const entity of result.entities) {
            if (entity.payload.deleted === true) knownIds.delete(entity.externalId);
            else knownIds.add(entity.externalId);
          }
          safeSet(cursorKey + ':catalog_checkpoint', JSON.stringify({ version: 1, ids: [...knownIds], complete: !result.hasMore }));
        }
        const next = typeof result.latestSeq === 'number' ? `seq:${result.latestSeq}`
          : result.entities.length >= CATCH_UP_PAGE_SIZE ? result.entities[result.entities.length - 1]?.updatedAt : result.serverTime;
        if (!next) break;
        safeSet(cursorKey, next);
        safeSet(upgradedKey, '1');
        if (!result.hasMore) {
          safeSet(`${cursorKey}:caught_up_at`, result.serverTime);
          break;
        }
        if (next === cursor) break;
        cursor = next;
      }
    } catch { /* Do not acknowledge a page which failed to apply. The next wake-up resumes it. */ }
    return { pulled };
  }
}
