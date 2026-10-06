import { db } from './db';
import { KeyValueStore } from './key_value_store';
import { InventoryItemSync, RecipeSync, SupplierSync } from './inventory_sync';
import { AuditRepository } from './repositories';

/**
 * One device, one restaurant. When a terminal is activated for a restaurant that is not the one whose data it
 * holds, everything belonging to the previous restaurant (staff and PINs, orders, KOTs, shifts, customers,
 * cash movements, audit, print jobs, sync cursors) is removed, so a new restaurant never sees, or uploads,
 * somebody else's data. Staff, menu and the rest then arrive from that restaurant's own cloud record.
 *
 * Orders the previous restaurant had not yet uploaded are not destroyed: they are set aside under a
 * quarantine key so support can recover them, but they are never shown to or synced by the new restaurant.
 */
const TENANT_KEY = 'jamanvaar_tenant_id';
const CURSOR_KEYS = [
  'jamanvaar_order_sync_cursor',
  'jamanvaar_order_sync_cursor:core',
  'jamanvaar_inventory_ledger_cursor',
  'jamanvaar_inventory_ledger_cursor:core',
  'jamanvaar_menu_applied_version'
];
const ENTITY_TYPES = ['CUSTOMER', 'INVENTORY_ITEM', 'RECIPE', 'SUPPLIER', 'PAYMENT_TRANSACTION', 'MENU_ITEM', 'MENU_CATEGORY', 'MODIFIER_GROUP', 'TAX_GROUP', 'STAFF_USER', 'DINING_TABLE', 'SERVICE_MESSAGE', 'COMBO', 'COUPON', 'CUSTOMER_FEEDBACK', 'SHIFT', 'CASH_MOVEMENT', 'RESERVATION', 'KIOSK_CONFIGURATION'];

export interface TenantEntry {
  /** True when data from another restaurant (or of unknown ownership) was removed. */
  wiped: boolean;
  /** Orders that had not reached a server, set aside rather than deleted. */
  quarantined: number;
}

export class TenantIsolation {
  static current(): string | null {
    return KeyValueStore.get(TENANT_KEY);
  }

  /** An already-activated device that predates this check adopts its own restaurant without losing anything. */
  static adopt(restaurantId: string): void {
    if (!this.current()) KeyValueStore.set(TENANT_KEY, restaurantId);
  }

  /** Clears this device's local copy for its own restaurant so it is rebuilt from the cloud (staff, orders and the rest sync back down). */
  static reset(restaurantId: string): TenantEntry {
    KeyValueStore.remove(TENANT_KEY);
    return this.enter(restaurantId);
  }

  /** Call when a device is activated for `restaurantId`. */
  static enter(restaurantId: string, opts: { unknownIsForeign?: boolean } = {}): TenantEntry {
    const known = this.current();
    if (known === restaurantId) return { wiped: false, quarantined: 0 };
    // Restaurant Admin holds the master copy of the restaurant's data: a first sign-in on an install that
    // predates this check adopts its data instead of discarding edits that may not have reached the cloud yet.
    if (known === null && opts.unknownIsForeign === false) {
      KeyValueStore.set(TENANT_KEY, restaurantId);
      return { wiped: false, quarantined: 0 };
    }

    const previous = this.current() ?? 'unknown';
    const unsynced = db.orders.filter((o) => o.syncStatus !== 'SYNCED' && o.syncStatus !== undefined);
    const unsyncedStock = db.stockMovements.filter(m => !m.syncedAt && !m.remote);
    if (unsyncedStock.length) {
      try {
        KeyValueStore.set(`jamanvaar_quarantine_inventory_${previous}_${Date.now()}`, JSON.stringify({ movements: unsyncedStock, definitions: db.inventoryItems, recipes: db.recipes, suppliers: db.suppliers }));
      } catch { /* Same best-effort quarantine policy as orders; foreign inventory must never remain visible. */ }
    }
    if (unsynced.length > 0) {
      try {
        KeyValueStore.set(`jamanvaar_quarantine_${previous}_${Date.now()}`, JSON.stringify(unsynced));
      } catch {
        // storage full: nothing more can be kept
      }
    }

    db.users = [];
    db.orders = [];
    db.kots = [];
    db.shifts = [];
    db.cashMovements = [];
    db.businessDays = [];
    db.paymentTransactions = [];
    db.receipts = [];
    db.serviceRequests = [];
    db.syncEvents = [];
    db.notifications = [];
    db.heldOrders = [];
    db.managerOverrides = [];
    db.reservations = [];
    db.staffPayRates = {};
    db.staffSchedules = [];
    db.attendanceRecords = [];
    db.waitlist = [];
    db.eodReports = [];
    db.feedbacks = [];
    db.customerAccounts = [];
    db.stockMovements = [];
    db.inventoryItems = []; db.recipes = []; db.suppliers = []; db.goodsReceipts = []; db.inventoryBatches = []; db.stockCounts = [];
    InventoryItemSync.reset(); RecipeSync.reset(); SupplierSync.reset();
    db.printJobs = [];
    db.devices = [];
    db.kiosks = [];
    db.auditLogs = [];
    db.tokenSequenceResets = {};
    db.resetKioskConfiguration();
    for (const key of KeyValueStore.keys()) if (key.startsWith('jamanvaar_kiosk_configuration_')) KeyValueStore.remove(key);

    for (const k of CURSOR_KEYS) KeyValueStore.remove(k);
    for (const t of ENTITY_TYPES) {
      KeyValueStore.remove(`jamanvaar_entity_sync_cursor_${t}`);
      KeyValueStore.remove(`jamanvaar_entity_sync_cursor_${t}:core`);
    }
    for (const key of KeyValueStore.keys()) if (key.includes(':device:') && (key.includes('sync_cursor') || key.includes('ledger_cursor'))) KeyValueStore.remove(key);
    KeyValueStore.set(TENANT_KEY, restaurantId);
    AuditRepository.log({ action: 'TENANT_SWITCH_LOCAL_DATA_CLEARED', category: 'SETTINGS', details: `Local data from ${previous} was cleared when this device was activated for ${restaurantId}; ${unsynced.length} unsent order(s) were set aside.`, username: 'System' });
    db.notify();
    return { wiped: true, quarantined: unsynced.length };
  }
}
