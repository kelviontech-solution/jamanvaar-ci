import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, OrderRepository, CustomerRepository, InventoryRepository } from '@jamanvaar/database';
import type { Order } from '@jamanvaar/types';

beforeEach(() => { db.orders = []; db.kots = []; db.customerAccounts = []; });
afterEach(() => vi.restoreAllMocks());
describe('financial mutation rollback boundary', () => {
  it('never publishes or stores the intermediate failed mutation', () => {
    const seen: string[][] = [];
    const unsubscribe = db.subscribe(() => seen.push(db.orders.map(order => order.id)));
    try {
      expect(() => db.transaction(() => {
        db.orders.push({ id: 'uncommitted' } as Order); db.notify();
        throw Error('Inventory failed');
      })).toThrow('Inventory failed');
      expect(seen).toEqual([[]]); expect(db.orders).toEqual([]);
    } finally { unsubscribe(); }
  });
  it('discards nested external effects on failure and sends successful effects after observers see the final mutation', () => {
    const events: string[] = [];
    const unsubscribe = db.subscribe(() => events.push('notify'));
    try {
      expect(() => db.transaction(() => {
        db.transaction(() => { db.afterTransaction(() => events.push('relay')); db.notify(); });
        throw Error('Outer action failed');
      })).toThrow('Outer action failed');
      expect(events).toEqual(['notify']); events.length = 0;
      db.transaction(() => { db.afterTransaction(() => events.push('relay')); db.notify(); });
      expect(events).toEqual(['notify', 'relay']);
    } finally { unsubscribe(); }
  });
  it('rolls back the paid state, table release and customer mutation if earning points fails', () => {
    const order = { id: 'bill', items: [], paymentStatus: 'PENDING', paymentMethod: 'CASH_AT_COUNTER', orderStatus: 'CONFIRMED', totalAmount: 100, customerPhone: '9876500012', customerName: 'Test Guest', updatedAt: '2026-01-01T00:00:00Z' } as unknown as Order;
    db.orders.push(order);
    vi.spyOn(CustomerRepository, 'earnPointsForOrder').mockImplementation(() => { throw Error('Loyalty write failed'); });
    const seen: string[] = [], unsubscribe = db.subscribe(() => seen.push(db.orders[0].paymentStatus));
    try {
      expect(() => OrderRepository.settleOrder('bill', 'CASH_AT_COUNTER', 100, 'same-transaction')).toThrow('Loyalty write failed');
      expect(db.orders[0]).toMatchObject({ paymentStatus: 'PENDING', orderStatus: 'CONFIRMED' });
      expect(db.orders[0].paymentTransactionId).toBeUndefined();
      expect(db.customerAccounts).toEqual([]);
      expect(seen).toEqual(['PENDING']);
    } finally { unsubscribe(); }
  });
  it('does not report a successful mutation as failed if only subsequent relay delivery throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(db.transaction(() => { db.afterTransaction(() => { throw Error('Relay offline'); }); return 'locally recorded'; })).toBe('locally recorded');
  });
  it('keeps a cancellation pending when its inventory reversal fails', () => {
    db.orders = [{ id: 'cancel-me', orderStatus: 'CONFIRMED', paymentStatus: 'PENDING', items: [] } as unknown as Order];
    vi.spyOn(InventoryRepository, 'restoreForOrder').mockImplementation(() => { throw Error('Stock reversal failed'); });
    expect(() => OrderRepository.updateOrderStatus('cancel-me', 'CANCELLED')).toThrow('Stock reversal failed');
    expect(db.orders[0].orderStatus).toBe('CONFIRMED');
  });
  it('restores batches, dish availability and stock alerts when an order fails after inventory consumption', () => {
    const previous = structuredClone({ menuItems: db.menuItems, inventoryItems: db.inventoryItems, inventoryBatches: db.inventoryBatches, recipes: db.recipes, notifications: db.notifications, stockMovements: db.stockMovements });
    try {
      db.menuItems = [{ id: 'meal', name: 'Meal', price: 100, isAvailable: true, stockQuantity: 1 } as any];
      db.inventoryItems = [{ id: 'rice', name: 'Rice', unit: 'kg', currentStock: 1, minStockLevel: 0, status: 'IN_STOCK' } as any];
      db.inventoryBatches = [{ id: 'rice-batch', itemId: 'rice', quantityRemaining: 1, receivedAt: '2026-10-01', expiryDate: '2026-10-30' } as any];
      db.recipes = [{ id: 'meal-recipe', menuItemId: 'meal', isActive: true, ingredients: [{ inventoryItemId: 'rice', inventoryItemName: 'Rice', quantityPerPortion: 1, unit: 'kg' }] } as any];
      db.notifications = []; db.stockMovements = [];
      const before = structuredClone({ menuItems: db.menuItems, inventoryItems: db.inventoryItems, inventoryBatches: db.inventoryBatches });
      expect(() => db.transaction(() => {
        const order = { id: 'failed-meal', items: [{ id: 'line', menuItemId: 'meal', name: 'Meal', quantity: 1 }], orderStatus: 'CONFIRMED' } as Order;
        InventoryRepository.reconcileOrder(order);
        expect(db.inventoryBatches[0].quantityRemaining).toBe(0);
        expect(db.menuItems[0].isAvailable).toBe(false);
        expect(db.notifications.length).toBeGreaterThan(0);
        throw Error('Subsequent financial step failed');
      })).toThrow('Subsequent financial step failed');
      expect(db.menuItems).toEqual(before.menuItems);
      expect(db.inventoryItems).toEqual(before.inventoryItems);
      expect(db.inventoryBatches).toEqual(before.inventoryBatches);
      expect(db.notifications).toEqual([]); expect(db.stockMovements).toEqual([]);
    } finally { Object.assign(db, previous); }
  });
});
