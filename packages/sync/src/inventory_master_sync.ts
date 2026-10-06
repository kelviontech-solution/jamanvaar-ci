import { InventoryItemSync, RecipeSync, SupplierSync } from '@jamanvaar/database';
import { EntitySyncEngine } from './entity_sync';
import { syncCollection } from './menu_sync';

let inFlight: Promise<void> | null = null;
let again = false;
let pushNext = false;
/** The same delta/tombstone protocol as menu sync; masters arrive before their ledger movements. */
export function syncInventoryMasters(opts: { push: boolean }): Promise<void> {
  pushNext ||= opts.push;
  if (inFlight) { again = true; return inFlight; }
  inFlight = (async () => {
    do {
      again = false; const push = pushNext; pushNext = false;
      for (const [type, collection] of [['INVENTORY_ITEM', InventoryItemSync], ['RECIPE', RecipeSync], ['SUPPLIER', SupplierSync]] as const) {
        EntitySyncEngine.registerWakeUp(type, () => syncInventoryMasters(opts));
        if (collection.isEmpty()) EntitySyncEngine.restartFromBeginning(type);
        // Each collection has its own accepted shape and handles deletions and baseline projection.
      }
      await syncCollection('INVENTORY_ITEM', InventoryItemSync, push);
      await syncCollection('RECIPE', RecipeSync, push);
      await syncCollection('SUPPLIER', SupplierSync, push);
    } while (again);
  })().finally(() => { inFlight = null; });
  return inFlight;
}
export function pendingInventoryMasterChanges(): number {
  return InventoryItemSync.collectSyncRecords().length + RecipeSync.collectSyncRecords().length + SupplierSync.collectSyncRecords().length;
}
