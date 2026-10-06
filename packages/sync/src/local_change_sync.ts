import { db, MenuItemSync, CategorySync, ModifierGroupSync, TaxGroupSync, ComboSync, CouponSync, TableSync } from '@jamanvaar/database';
import { pendingCatalogChanges, syncMenuCatalog, syncPromotions } from './menu_sync';
import { pendingStaffChanges, syncStaffUsers } from './staff_sync';
import { syncDiningTables } from './floor_sync';

/** Publish actual local edits immediately. Remote application updates the collection acknowledgements first. */
export function startLocalChangeSync(opts: { menu?: boolean; promotions?: boolean; staff?: boolean; tables?: boolean }): () => void {
  let queued = false;
  let stopped = false;
  const unsubscribe = db.subscribe(() => {
    if (queued || stopped) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (stopped) return;
      if (opts.menu) {
        [MenuItemSync, CategorySync, ModifierGroupSync, TaxGroupSync].forEach((s) => s.stampChanges());
        if (pendingCatalogChanges()) void syncMenuCatalog({ push: true }).catch(() => undefined);
      }
      if (opts.promotions) {
        ComboSync.stampChanges(); CouponSync.stampChanges();
        if (ComboSync.collectSyncRecords().length || CouponSync.collectSyncRecords().length) void syncPromotions({ pushCombos: true, pushCoupons: true }).catch(() => undefined);
      }
      if (opts.staff && pendingStaffChanges()) void syncStaffUsers({ push: true }).catch(() => undefined);
      if (opts.tables) {
        TableSync.stampChanges();
        if (TableSync.collectSyncRecords().length) void syncDiningTables().catch(() => undefined);
      }
    });
  });
  return () => { stopped = true; unsubscribe(); };
}
