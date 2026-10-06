import { db } from './db';
/** Restore menu collections before batch flush on failure; do not touch historical transactions. */
export function menuTransaction<T>(work: () => T): T {
  const collections = ['categories', 'menuItems', 'modifierGroups', 'taxGroups', 'combos', 'recipes', 'menuImportHistory', 'auditLogs'] as const;
  const before = collections.map(key => [key, structuredClone(db[key])] as const);
  return db.batch(() => {
    try { return work(); }
    catch (error) {
      for (const [key, values] of before) (db[key] as unknown[]).splice(0, db[key].length, ...values);
      db.notify(); throw error;
    }
  });
}
