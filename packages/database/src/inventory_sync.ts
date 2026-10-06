import type { InventoryItem, Recipe, Supplier } from '@jamanvaar/types';
import { CollectionSync } from './collection_sync';
import { db } from './db';

function movementTotal(id: string): number {
  return db.stockMovements.filter(m => m.itemId === id).reduce((sum, m) => sum + m.quantityDelta, 0);
}

/** Stock definitions carry an opening balance, never an overwrite of another terminal's live ledger balance. */
export const InventoryItemSync = new CollectionSync<InventoryItem>(
  'jamanvaar_inventory_master_sync_v1', () => db.inventoryItems,
  r => typeof r.name === 'string' && typeof r.unit === 'string' && Number.isFinite(r.openingStock ?? r.currentStock),
  'id',
  item => {
    item.openingStock ??= item.currentStock - movementTotal(item.id);
    return { ...item, currentStock: item.openingStock, status: item.openingStock <= 0 ? 'OUT_OF_STOCK' : item.openingStock <= item.minStockLevel ? 'LOW_STOCK' : 'IN_STOCK' };
  },
  item => {
    const openingStock = item.openingStock ?? item.currentStock;
    const currentStock = openingStock + movementTotal(item.id);
    return { ...item, openingStock, currentStock, status: currentStock <= 0 ? 'OUT_OF_STOCK' : currentStock <= item.minStockLevel ? 'LOW_STOCK' : 'IN_STOCK' };
  }
);
export const RecipeSync = new CollectionSync<Recipe & { updatedAt?: string }>(
  'jamanvaar_recipe_sync_v1', () => db.recipes, r => typeof r.menuItemId === 'string' && Array.isArray(r.ingredients)
);
export const SupplierSync = new CollectionSync<Supplier>(
  'jamanvaar_supplier_sync_v1', () => db.suppliers, r => typeof r.name === 'string' && r.name.length > 0
);
