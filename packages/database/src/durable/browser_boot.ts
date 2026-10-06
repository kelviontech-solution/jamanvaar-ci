import { KeyValueStore } from '../key_value_store';
import { db, JamanvaarDatabase, type DbStorage } from '../db';
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
export async function bootDurableStorage(opts: { appId?: string; restaurantId?: string | null } = {}): Promise<DurableBootResult> {
  const app = opts.appId?.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const name = app ? `${DB_NAME}-${app}` : DB_NAME;
  let cluster: ClusterBackend | null = null;
  // App-specific browser storage also isolates the fallback on browsers without OPFS.
  const prefix = app ? `jamanvaar_app_${app}:` : '';
  KeyValueStore.setBrowserNamespace(prefix);
  const fallback: DbStorage & { keys(): string[] } = {
    getItem: (key) => localStorage.getItem(prefix + key),
    setItem: (key, value) => localStorage.setItem(prefix + key, value),
    removeItem: (key) => localStorage.removeItem(prefix + key),
    keys: () => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).filter((k) => k?.startsWith(prefix)).map((k) => k.slice(prefix.length))
  };
  const attachFallback = () => {
    if (!app) return;
    if (!fallback.getItem('__app_scope_migrated')) {
      let owner: string | null = null;
      try { owner = localStorage.getItem('jamanvaar_tenant_id') ?? JSON.parse(localStorage.getItem('jamanvaar_db_restaurant') || 'null')?.id; } catch { /* legacy store unreadable */ }
      if (opts.restaurantId && owner === opts.restaurantId) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)!;
          if (key?.startsWith('jamanvaar_') && !key.startsWith('jamanvaar_app_') && !key.includes('_device_token')) fallback.setItem(key, localStorage.getItem(key)!);
        }
      }
      fallback.setItem('__app_scope_migrated', '1');
    }
    db.discardUnscopedCache();
    JamanvaarDatabase.attachDurableStorageToAll(fallback);
    KeyValueStore.attach(fallback, { migrateLegacy: false });
  };
  try {
    const nav = navigator as Navigator & { locks?: Locks };
    if (typeof Worker === 'undefined') { attachFallback(); return { mode: 'legacy', reason: 'WORKERS_UNSUPPORTED' }; }
    if (!nav.storage?.getDirectory) { attachFallback(); return { mode: 'legacy', reason: 'OPFS_UNSUPPORTED' }; }
    if (!nav.locks) { attachFallback(); return { mode: 'legacy', reason: 'WEB_LOCKS_UNSUPPORTED' }; }

    // Ask the browser not to evict the database under storage pressure.
    void nav.storage.persist?.().catch(() => undefined);

    cluster = new ClusterBackend({
      name,
      windowId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      locks: nav.locks,
      makeChannel: () => new BroadcastChannel(`jamanvaar-db-${name}`) as never,
      makeLeaderBackend: () =>
        new WorkerBackend(new Worker(new URL('./sqlite_worker.ts', import.meta.url), { type: 'module' }) as never, name)
    });
    const storage = await DurableStorage.open(cluster);

    let migrated = 0;
    if (app && !storage.getItem('__app_scope_migrated')) {
      // Copy legacy data only when its ownership matches this app's existing activation.
      // Keep the original database untouched so unsent records remain recoverable.
      const legacyCluster = new ClusterBackend({
        name: DB_NAME, windowId: `migration-${app}-${Date.now()}`, locks: nav.locks,
        makeChannel: () => new BroadcastChannel(`jamanvaar-db-${DB_NAME}`) as never,
        makeLeaderBackend: () => new WorkerBackend(new Worker(new URL('./sqlite_worker.ts', import.meta.url), { type: 'module' }) as never, DB_NAME)
      });
      let legacy: DurableStorage | null = null;
      try {
        legacy = await DurableStorage.open(legacyCluster);
        const snapshotOwner = legacy.getItem('jamanvaar_tenant_id') ?? (() => { try { return JSON.parse(legacy!.getItem('jamanvaar_db_restaurant') || 'null')?.id; } catch { return null; } })();
        if (opts.restaurantId && snapshotOwner === opts.restaurantId) {
          for (const key of legacy.keys()) if (key.startsWith('jamanvaar_') && !key.includes('_device_token')) {
            storage.setItem(key, legacy.getItem(key)!); migrated++;
          }
        }
      } catch (error) { console.warn('Legacy SQLite import unavailable; original data retained', error); }
      finally { legacy?.close(); legacyCluster.close(); }
      storage.setItem('__app_scope_migrated', '1');
      await storage.flush();
    }
    if (app) attachFallback();
    for (const prefix of JamanvaarDatabase.knownPrefixes()) {
      migrated += (await migrateFromLocalStorage(storage, app ? { ...fallback, length: fallback.keys().length, key: (i: number) => fallback.keys()[i] ?? null } : localStorage, prefix)).migrated;
    }

    if (app) db.discardUnscopedCache();
    JamanvaarDatabase.attachDurableStorageToAll(storage);
    KeyValueStore.attach(storage, { migrateLegacy: !app });

    // Best effort: push anything still queued when the window goes away.
    window.addEventListener('pagehide', () => void storage.flush().catch(() => undefined));
    (window as unknown as { __jamanvaarStorage?: DurableStorage }).__jamanvaarStorage = storage;
    return { mode: 'sqlite', role: cluster.isLeader ? 'leader' : 'follower', migrated };
  } catch (err) {
    cluster?.close();
    try { attachFallback(); } catch { /* unavailable browser storage: repositories remain in memory */ }
    console.error('SQLite storage unavailable, continuing on localStorage:', err);
    return { mode: 'legacy', reason: err instanceof Error ? err.message : String(err) };
  }
}
