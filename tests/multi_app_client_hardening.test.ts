import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository, InventoryRepository, RecipeRepository } from '../packages/database/src';
import { SyncOutboxEngine, CloudSyncedOrder, OrderSyncPushEvent } from '../packages/sync/src';

/**
 * Device-side fixes from the onboarding/multi-app audit: server sequence (not clocks) decides which copy of an order is newer,
 * every distinct change has its own event id, pushes carry the version they were based on, and stock booked for an order is the
 * same movement on every console.
 */
describe('multi-app client hardening', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    SyncOutboxEngine.configureTransport(null);
  });

  const mkOrder = () =>
    OrderRepository.createOrder({
      orderType: 'DINE_IN', tableNumber: '4',
      items: [{ id: 'oi-1', orderId: '', menuItemId: db.menuItems[0].id, name: 'Tea', sku: 'T', quantity: 1, unitPrice: 100, modifiers: [], totalPrice: 100, kitchenStatus: 'PENDING' } as never],
      subtotal: 100, taxAmount: 0, totalAmount: 100, paymentStatus: 'PENDING', orderStatus: 'NEW', cashierName: 'C', source_type: 'POS'
    } as never);

  const remoteFor = (id: string, over: Partial<CloudSyncedOrder> = {}): CloudSyncedOrder => ({
    externalOrderId: id, orderType: 'DINE_IN', status: 'READY', tableId: null, tableLabel: '4',
    items: [{ externalItemId: 'oi-1', name: 'Tea', quantity: 1, unitPrice: 10000, modifiers: [], lineTotal: 10000, kitchenStatus: 'READY' }],
    subtotal: 10000, taxAmount: 0, discountAmount: 0, totalAmount: 10000, paymentStatus: 'PENDING', updatedAt: '2020-01-01T00:00:00.000Z', seq: 7, syncVersion: 3, ...over
  } as CloudSyncedOrder);

  async function pull(orders: CloudSyncedOrder[]) {
    SyncOutboxEngine.configureTransport({ push: async (e: OrderSyncPushEvent[]) => ({ results: e.map((x) => ({ externalOrderId: x.externalOrderId, status: 'ok' as const, syncVersion: 4 })), serverTime: new Date().toISOString() }), pull: async () => ({ orders, serverTime: new Date().toISOString(), latestSeq: 7 }) } as never);
    await SyncOutboxEngine.catchUpFromCloud();
  }

  it('a device whose clock runs a day ahead still receives the kitchen update (sequence, not clock, decides)', async () => {
    const o = mkOrder();
    o.syncStatus = 'SYNCED';
    o.updatedAt = new Date(Date.now() + 86400000).toISOString(); // this device clock is a day ahead of the server
    await pull([remoteFor(o.id)]);
    expect(db.orders.find((x) => x.id === o.id)!.items[0].kitchenStatus).toBe('READY');
    expect(db.orders.find((x) => x.id === o.id)!.remoteSeq).toBe(7);
  });

  it('an older sequence is ignored, and an order with unsent local changes is not overwritten (the push goes first)', async () => {
    const o = mkOrder();
    o.syncStatus = 'SYNCED';
    o.remoteSeq = 9;
    await pull([remoteFor(o.id, { seq: 7 })]);
    expect(db.orders.find((x) => x.id === o.id)!.items[0].kitchenStatus).toBe('PENDING'); // older than what we already have

    const p = mkOrder();
    p.syncStatus = 'SAVED_LOCALLY';
    await pull([remoteFor(p.id, { seq: 8 })]);
    expect(db.orders.find((x) => x.id === p.id)!.items[0].kitchenStatus).toBe('PENDING'); // pending local change wins until pushed
  });

  it('two different changes in the same millisecond get different event ids; a retry of one keeps its id', async () => {
    const o = mkOrder();
    const sent: OrderSyncPushEvent[] = [];
    SyncOutboxEngine.configureTransport({ push: async (e: OrderSyncPushEvent[]) => { sent.push(...e); return { results: e.map((x) => ({ externalOrderId: x.externalOrderId, status: 'ok' as const, syncVersion: 2 })), serverTime: '' }; }, pull: async () => ({ orders: [], serverTime: '' }) } as never);
    const sameMs = '2026-09-27T10:00:00.000Z';
    o.updatedAt = sameMs; o.syncStatus = 'SAVED_LOCALLY';
    await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    o.orderStatus = 'PREPARING'; o.updatedAt = sameMs; o.syncStatus = 'SAVED_LOCALLY'; // a real change that did not move the clock
    await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    o.syncStatus = 'SAVED_LOCALLY'; // retry of the unchanged second version
    await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    const ids = sent.filter((e) => e.externalOrderId === o.id).map((e) => e.eventId);
    expect(ids).toHaveLength(3);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[1]).toBe(ids[2]);
  });

  it('a push carries the version the device last saw, so the server can refuse to overwrite newer totals', async () => {
    const o = mkOrder();
    const sent: OrderSyncPushEvent[] = [];
    SyncOutboxEngine.configureTransport({ push: async (e: OrderSyncPushEvent[]) => { sent.push(...e); return { results: e.map((x) => ({ externalOrderId: x.externalOrderId, status: 'ok' as const, syncVersion: 5 })), serverTime: '' }; }, pull: async () => ({ orders: [], serverTime: '' }) } as never);
    o.syncStatus = 'SAVED_LOCALLY';
    await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    expect((sent[0] as { baseSyncVersion?: number }).baseSyncVersion).toBeUndefined(); // first push: nothing seen yet
    expect(o.remoteSyncVersion).toBe(5);
    o.orderStatus = 'PREPARING'; o.syncStatus = 'SAVED_LOCALLY';
    await SyncOutboxEngine.processOutbox({ ignoreBackoff: true });
    expect((sent[1] as { baseSyncVersion?: number }).baseSyncVersion).toBe(5);
  });
});

describe('stock for one order is one movement on every console', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    db.inventoryItems = []; db.recipes = []; db.stockMovements = [];
    InventoryRepository.createItem({ id: 'inv-flour', name: 'Flour', sku: 'F', category: 'Dry', unit: 'kg', currentStock: 10, minStockLevel: 1, reorderLevel: 2, costPerUnit: 40 });
    RecipeRepository.createRecipe({ menuItemId: 'dish-1', menuItemName: 'Pizza', ingredients: [{ inventoryItemId: 'inv-flour', inventoryItemName: 'Flour', quantityPerPortion: 0.5, unit: 'kg' }] } as never);
  });
  const stock = () => db.inventoryItems.find((i) => i.id === 'inv-flour')!.currentStock;
  const order = () => OrderRepository.createOrder({
    orderType: 'DINE_IN', tableNumber: '1',
    items: [{ id: 'oi-9', orderId: '', menuItemId: 'dish-1', name: 'Pizza', sku: 'P', quantity: 2, unitPrice: 200, modifiers: [], totalPrice: 400, kitchenStatus: 'PREPARING' } as never],
    subtotal: 400, taxAmount: 0, totalAmount: 400, paymentStatus: 'PENDING', orderStatus: 'PREPARING', cashierName: 'C', source_type: 'POS'
  } as never);

  it('a second console reconciling the same order (fresh bookkeeping) does not deduct again', () => {
    const o = order();
    expect(stock()).toBeCloseTo(9);
    const movement = db.stockMovements.find((m) => m.orderId === o.id)!;
    expect(movement.id).toBe(`sale:${o.id}:oi-9:inv-flour:0>2`);
    o.stockConsumedQty = {}; // another console starts with no memory of having booked it
    InventoryRepository.reconcileOrder(o);
    expect(stock()).toBeCloseTo(9);
    expect(db.stockMovements.filter((m) => m.orderId === o.id)).toHaveLength(1);
  });

  it('a movement already received from the ledger from another console counts as booked', () => {
    const o = OrderRepository.createOrder({
      orderType: 'DINE_IN', tableNumber: '2', items: [], subtotal: 0, taxAmount: 0, totalAmount: 0, paymentStatus: 'PENDING', orderStatus: 'PREPARING', cashierName: 'C', source_type: 'POS'
    } as never);
    o.items.push({ id: 'oi-x', orderId: o.id, menuItemId: 'dish-1', name: 'Pizza', sku: 'P', quantity: 2, unitPrice: 200, modifiers: [], totalPrice: 400, kitchenStatus: 'PREPARING' } as never);
    db.stockMovements.unshift({ id: `remote:sale:${o.id}:oi-x:inv-flour:0>2`, itemId: 'inv-flour', itemName: 'Flour', type: 'SALE', quantityDelta: -1, unit: 'kg', orderId: o.id, timestamp: new Date().toISOString() } as never);
    const before = stock();
    InventoryRepository.reconcileOrder(o);
    expect(stock()).toBeCloseTo(before);
  });

  it('an add-on round is a new step and is booked once', () => {
    const o = order();
    o.items[0].quantity = 3;
    InventoryRepository.reconcileOrder(o);
    o.stockConsumedQty = { 'oi-9': 2 };
    InventoryRepository.reconcileOrder(o);
    expect(stock()).toBeCloseTo(8.5);
  });
});
