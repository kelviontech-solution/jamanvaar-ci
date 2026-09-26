import { KeyValueStore } from '../key_value_store';
import { JamanvaarDatabase } from '../db';
import { DurableStorage, migrateFromLocalStorage } from './durable_storage';
import { ClusterBackend, type Locks } from './cluster_backend';
import { WorkerBackend } from './worker_backend';

export type DurableBootResult =
  | { mode: 'sqlite'; role: 'leader' | 'follower'; migrated: number }
  | { mode: 'legacy'; reason: string };

const DB_NAME = 'jamanvaar';

/**
 * Switches the app's database from localStorage to SQLite (in the browser's private file system). Call it
 * once, and wait for it, before the UI renders. If this browser can't do it, the app carries on exactly as
 * before on localStorage and the reason is returned.
 */
export async function bootDurableStorage(): Promise<DurableBootResult> {
  try {
    const nav = navigator as Navigator & { locks?: Locks };
    if (typeof Worker === 'undefined') return { mode: 'legacy', reason: 'WORKERS_UNSUPPORTED' };
    if (!nav.storage?.getDirectory) return { mode: 'legacy', reason: 'OPFS_UNSUPPORTED' };
    if (!nav.locks) return { mode: 'legacy', reason: 'WEB_LOCKS_UNSUPPORTED' };

    // Ask the browser not to evict the database under storage pressure.
    void nav.storage.persist?.().catch(() => undefined);

    const cluster = new ClusterBackend({
      name: DB_NAME,
      windowId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      locks: nav.locks,
      makeChannel: () => new BroadcastChannel(`jamanvaar-db-${DB_NAME}`) as never,
      makeLeaderBackend: () =>
        new WorkerBackend(new Worker(new URL('./sqlite_worker.ts', import.meta.url), { type: 'module' }) as never, DB_NAME)
    });
    const storage = await DurableStorage.open(cluster);

    let migrated = 0;
    for (const prefix of JamanvaarDatabase.knownPrefixes()) {
      migrated += (await migrateFromLocalStorage(storage, localStorage, prefix)).migrated;
    }

    JamanvaarDatabase.attachDurableStorageToAll(storage);
    KeyValueStore.attach(storage);

    // Best effort: push anything still queued when the window goes away.
    window.addEventListener('pagehide', () => void storage.flush().catch(() => undefined));
    (window as unknown as { __jamanvaarStorage?: DurableStorage }).__jamanvaarStorage = storage;
    return { mode: 'sqlite', role: cluster.isLeader ? 'leader' : 'follower', migrated };
  } catch (err) {
    console.error('SQLite storage unavailable, continuing on localStorage:', err);
    return { mode: 'legacy', reason: err instanceof Error ? err.message : String(err) };
  }
}
