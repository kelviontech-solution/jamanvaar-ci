import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository, KOTRepository } from '@jamanvaar/database';
import type { KOTRecord, Order, OrderItem } from '@jamanvaar/types';

/**
 * BUG-098 / BUG-113 (found in the live Captain test): the kitchen marked a ticket ready on KDS and
 * the order's dishes arrived on Captain as READY, but Captain's own tickets stayed "preparing" and
 * its Food Ready list stayed empty; and after POS settled the order, KDS kept showing the ticket.
 * Tickets are per device, so each device must bring them in line with the order it just received.
 */
describe('Kitchen tickets follow the order they belong to (BUG-098/113)', () => {
  const item = (menuItemId: string, name: string, qty = 1, kitchenStatus: OrderItem['kitchenStatus'] = 'PREPARING') => ({
    id: `oi-${menuItemId}`, orderId: '', menuItemId, name, sku: menuItemId, quantity: qty, unitPrice: 100, totalPrice: 100 * qty, modifiers: [], kitchenStatus
  });

  const seedOrder = (items: ReturnType<typeof item>[], orderStatus: Order['orderStatus'] = 'PREPARING') =>
    OrderRepository.createOrder({ orderType: 'DINE_IN', tableNumber: '1', items, subtotal: 200, taxAmount: 10, totalAmount: 210, paymentMethod: 'CASH', paymentStatus: 'PENDING', orderStatus });

  const kotFor = (order: Order, menuItemIds: string[], station = 'Main Kitchen'): KOTRecord =>
    KOTRepository.generateKOT({
      orderId: order.id, orderNumber: order.orderNumber, tokenNumber: order.tokenNumber, tableNumber: '1', orderType: 'DINE_IN', cashierName: 'Ravi',
      items: menuItemIds.map((id) => ({ id: `ki-${id}`, menuItemId: id, name: id, quantity: 1, modifiers: [], kitchenStation: station, status: 'PREPARING' as const }))
    })[0];

  beforeEach(() => {
    db.resetToDefaultSeed();
    db.kots = [];
    db.orders = [];
  });

  it('a ticket becomes READY, with a ready time, once the order says all its dishes are ready', () => {
    const order = seedOrder([item('a', 'A'), item('b', 'B')]);
    const kot = kotFor(order, ['a', 'b']);
    order.items.forEach((i) => { i.kitchenStatus = 'READY'; });

    expect(KOTRepository.reconcileWithOrders()).toBe(1);
    expect(kot.status).toBe('READY');
    expect(kot.readyAt).toBeTruthy();
  });

  it('stays preparing while any of its dishes is still cooking', () => {
    const order = seedOrder([item('a', 'A'), item('b', 'B')]);
    const kot = kotFor(order, ['a', 'b']);
    order.items[0].kitchenStatus = 'READY';

    KOTRepository.reconcileWithOrders();
    expect(kot.status).toBe('PREPARING');
  });

  it('each ticket of a split order follows only its own dishes', () => {
    const order = seedOrder([item('a', 'A'), item('b', 'B')]);
    const tandoor = kotFor(order, ['a'], 'Tandoor');
    const curry = kotFor(order, ['b'], 'Curry Station');
    order.items.find((i) => i.menuItemId === 'a')!.kitchenStatus = 'READY';

    KOTRepository.reconcileWithOrders();
    expect(tandoor.status).toBe('READY');
    expect(curry.status).toBe('PREPARING');
  });

  it('a ticket whose dishes are all served becomes SERVED', () => {
    const order = seedOrder([item('a', 'A')]);
    const kot = kotFor(order, ['a']);
    order.items[0].kitchenStatus = 'SERVED';

    KOTRepository.reconcileWithOrders();
    expect(kot.status).toBe('SERVED');
    expect(kot.servedAt).toBeTruthy();
  });

  it('tickets of an order that was completed or cancelled elsewhere leave the kitchen', () => {
    const done = seedOrder([item('a', 'A')], 'COMPLETED');
    const cancelled = seedOrder([item('b', 'B')], 'CANCELLED');
    const kotDone = kotFor(done, ['a']);
    const kotCancelled = kotFor(cancelled, ['b']);

    KOTRepository.reconcileWithOrders();
    expect(kotDone.status).toBe('SERVED');
    expect(kotCancelled.status).toBe('CANCELLED');
  });

  it('never moves a ticket backwards when the order copy is older', () => {
    const order = seedOrder([item('a', 'A')]);
    const kot = kotFor(order, ['a']);
    KOTRepository.updateKOTStatus(kot.id, 'READY');
    order.items[0].kitchenStatus = 'PREPARING';

    KOTRepository.reconcileWithOrders();
    expect(kot.status).toBe('READY');
  });

  it('reports nothing changed when tickets already match', () => {
    const order = seedOrder([item('a', 'A')]);
    kotFor(order, ['a']);
    expect(KOTRepository.reconcileWithOrders()).toBe(0);
  });
});

describe('Serving dishes from the waiter side (BUG-098)', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    db.kots = [];
    db.orders = [];
  });

  const setup = () => {
    const order = OrderRepository.createOrder({
      orderType: 'DINE_IN', tableNumber: '1', subtotal: 200, taxAmount: 10, totalAmount: 210, paymentMethod: 'CASH', paymentStatus: 'PENDING', orderStatus: 'PREPARING',
      items: ['a', 'b'].map((id) => ({ id: `oi-${id}`, orderId: '', menuItemId: id, name: id.toUpperCase(), sku: id, quantity: 1, unitPrice: 100, totalPrice: 100, modifiers: [], kitchenStatus: 'READY' as const }))
    });
    const [kot] = KOTRepository.generateKOT({
      orderId: order.id, orderNumber: order.orderNumber, tokenNumber: order.tokenNumber, tableNumber: '1', orderType: 'DINE_IN', cashierName: 'Ravi',
      items: ['a', 'b'].map((id) => ({ id: `ki-${id}`, menuItemId: id, name: id.toUpperCase(), quantity: 1, modifiers: [], kitchenStation: 'Main Kitchen', status: 'READY' as const }))
    });
    kot.status = 'READY';
    return { order, kot };
  };

  it('lists the ready dishes of ready tickets, one entry per dish, with stable ids', () => {
    const { kot } = setup();
    const ready = KOTRepository.getFoodReadyItems();
    expect(ready.map((r) => r.dishName).sort()).toEqual(['A', 'B']);
    expect(ready.every((r) => r.tableNumber === '1' && r.kotId === kot.id)).toBe(true);
    expect(KOTRepository.getFoodReadyItems().map((r) => r.id)).toEqual(ready.map((r) => r.id));
  });

  it('serving one dish removes it from the list and flags the order to sync', () => {
    const { order, kot } = setup();
    order.syncStatus = 'SYNCED';
    KOTRepository.markItemServed(kot.id, 'ki-a');

    expect(KOTRepository.getFoodReadyItems().map((r) => r.dishName)).toEqual(['B']);
    expect(order.items.find((i) => i.menuItemId === 'a')!.kitchenStatus).toBe('SERVED');
    expect(order.items.find((i) => i.menuItemId === 'b')!.kitchenStatus).toBe('READY');
    expect(order.syncStatus).toBe('SAVED_LOCALLY');
    expect(kot.status).toBe('READY');
  });

  it('serving the last dish serves the whole ticket', () => {
    const { kot } = setup();
    KOTRepository.markItemServed(kot.id, 'ki-a');
    KOTRepository.markItemServed(kot.id, 'ki-b');
    expect(kot.status).toBe('SERVED');
    expect(KOTRepository.getFoodReadyItems()).toEqual([]);
  });

  it('serving a whole ticket serves all its dishes', () => {
    const { order, kot } = setup();
    KOTRepository.markKotServed(kot.id);
    expect(kot.status).toBe('SERVED');
    expect(order.items.every((i) => i.kitchenStatus === 'SERVED')).toBe(true);
  });
});

describe('Order catch-up updates this device\'s tickets (BUG-098/113)', () => {
  it('a pulled order with ready dishes makes the local ticket ready, and a completed one clears it', async () => {
    const { SyncOutboxEngine } = await import('@jamanvaar/sync');
    db.resetToDefaultSeed();
    db.kots = [];
    db.orders = [];

    const order = OrderRepository.createOrder({
      orderType: 'DINE_IN', tableNumber: '1', subtotal: 100, taxAmount: 5, totalAmount: 105, paymentMethod: 'CASH', paymentStatus: 'PENDING', orderStatus: 'PREPARING',
      items: [{ id: 'oi-a', orderId: '', menuItemId: 'a', name: 'A', sku: 'a', quantity: 1, unitPrice: 100, totalPrice: 100, modifiers: [], kitchenStatus: 'PREPARING' as const }]
    });
    order.syncStatus = 'SYNCED';
    const [kot] = KOTRepository.generateKOT({
      orderId: order.id, orderNumber: order.orderNumber, tokenNumber: order.tokenNumber, tableNumber: '1', orderType: 'DINE_IN', cashierName: 'Ravi',
      items: [{ id: 'ki-a', menuItemId: 'a', name: 'A', quantity: 1, modifiers: [], kitchenStation: 'Main Kitchen', status: 'PREPARING' as const }]
    });

    const remote = (status: string, kitchenStatus: string) => ({
      externalOrderId: order.id, orderType: 'DINE_IN', status, tableLabel: '1', subtotal: 10000, taxAmount: 500, discountAmount: 0, totalAmount: 10500,
      items: [{ externalItemId: 'oi-a', menuItemId: 'a', name: 'A', quantity: 1, unitPrice: 10000, lineTotal: 10000, kitchenStatus }],
      updatedAt: new Date(Date.now() + 60_000).toISOString()
    });

    let next = remote('PREPARING', 'READY');
    SyncOutboxEngine.configureTransport({ push: async () => ({ results: [], serverTime: new Date().toISOString() }), pull: async () => ({ orders: [next as never], serverTime: new Date().toISOString() }) });

    await SyncOutboxEngine.catchUpFromCloud();
    expect(kot.status).toBe('READY');

    next = remote('COMPLETED', 'READY');
    (next as { updatedAt: string }).updatedAt = new Date(Date.now() + 120_000).toISOString();
    await SyncOutboxEngine.catchUpFromCloud();
    expect(kot.status).toBe('SERVED');
    SyncOutboxEngine.configureTransport(null);
  });
});
