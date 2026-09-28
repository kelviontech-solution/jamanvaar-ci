import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository, KOTRepository, kitchenRank, resolveKitchenState, deriveTicketStatus } from '@jamanvaar/database';
import { SyncOutboxEngine, type OrderSyncPushEvent, type CloudSyncedOrder } from '@jamanvaar/sync';
import type { KOTRecord, Order, OrderItem } from '@jamanvaar/types';

/**
 * Per-dish kitchen status, undo and cancellation. The rule everywhere (devices and cloud/api order-merge.ts): progress only
 * moves forward, except that a copy with a higher revision (a recall or a cancellation) replaces an older one.
 */
describe('resolving two copies of a dish\'s kitchen state', () => {
  it('moves forward, never back, at the same revision', () => {
    expect(resolveKitchenState({ status: 'PREPARING' }, { status: 'READY' })).toEqual({ status: 'READY', rev: 0 });
    expect(resolveKitchenState({ status: 'READY' }, { status: 'PREPARING' })).toEqual({ status: 'READY', rev: 0 });
  });

  it('a higher revision wins even when it goes backwards (undo)', () => {
    expect(resolveKitchenState({ status: 'READY', rev: 0 }, { status: 'PREPARING', rev: 1 })).toEqual({ status: 'PREPARING', rev: 1 });
    // ...and the older copy cannot bring it back
    expect(resolveKitchenState({ status: 'PREPARING', rev: 1 }, { status: 'READY', rev: 0 })).toEqual({ status: 'PREPARING', rev: 1 });
  });

  it('a cancellation is final at its revision', () => {
    expect(resolveKitchenState({ status: 'CANCELLED', rev: 1 }, { status: 'READY', rev: 1 }).status).toBe('CANCELLED');
    expect(resolveKitchenState({ status: 'READY', rev: 0 }, { status: 'CANCELLED', rev: 1 }).status).toBe('CANCELLED');
  });

  it('applying the same copy twice changes nothing', () => {
    const once = resolveKitchenState({ status: 'PREPARING' }, { status: 'READY', rev: 2 });
    expect(resolveKitchenState(once, { status: 'READY', rev: 2 })).toEqual(once);
    expect(kitchenRank('served')).toBe(3);
  });

  it('a ticket\'s status comes from its live dishes only', () => {
    expect(deriveTicketStatus(['READY', 'PREPARING'])).toBe('PREPARING');
    expect(deriveTicketStatus(['READY', 'READY'])).toBe('READY');
    expect(deriveTicketStatus(['READY', 'CANCELLED'])).toBe('READY');
    expect(deriveTicketStatus(['SERVED', 'CANCELLED'])).toBe('SERVED');
    expect(deriveTicketStatus(['CANCELLED', 'CANCELLED'])).toBe('CANCELLED');
    expect(deriveTicketStatus([])).toBeNull();
  });
});

describe('the cook marks one dish at a time', () => {
  const line = (id: string, menuItemId: string, name: string, extra: Partial<OrderItem> = {}): OrderItem => ({
    id, orderId: '', menuItemId, name, sku: menuItemId, quantity: 1, unitPrice: 100, totalPrice: 100, modifiers: [], kitchenStatus: 'PREPARING', ...extra
  });

  let order: Order;
  let kot: KOTRecord;

  beforeEach(() => {
    db.resetToDefaultSeed();
    db.kots = [];
    db.orders = [];
    order = OrderRepository.createOrder({
      orderType: 'DINE_IN', tableNumber: '4', subtotal: 300, taxAmount: 15, totalAmount: 315, paymentMethod: 'CASH', paymentStatus: 'PENDING', orderStatus: 'PREPARING',
      items: [line('oi-1', 'paneer', 'Paneer Tikka'), line('oi-2', 'naan', 'Butter Naan'), line('oi-3', 'naan', 'Butter Naan')]
    });
    [kot] = KOTRepository.generateKOT({
      orderId: order.id, orderNumber: order.orderNumber, tokenNumber: order.tokenNumber, tableNumber: '4', orderType: 'DINE_IN', cashierName: 'Ravi',
      items: order.items.map((i) => ({ id: `k-${i.id}`, menuItemId: i.menuItemId, name: i.name, quantity: 1, modifiers: [], kitchenStation: 'Main Kitchen', status: 'PREPARING' as const, orderItemId: i.id }))
    });
    order.syncStatus = 'SYNCED';
  });

  it('marking one dish ready does not make the ticket ready, and the dish shows up as ready to serve', () => {
    expect(KOTRepository.setItemStatus(kot.id, 'k-oi-1', 'READY')).toBe(true);
    expect(kot.status).toBe('PREPARING');
    expect(kot.items.find((i) => i.id === 'k-oi-1')!.status).toBe('READY');
    expect(KOTRepository.getFoodReadyItems().map((r) => r.dishName)).toEqual(['Paneer Tikka']);
    expect(order.syncStatus).toBe('SAVED_LOCALLY');
  });

  it('the ticket and the order become ready when the last dish is done', () => {
    ['k-oi-1', 'k-oi-2', 'k-oi-3'].forEach((id) => KOTRepository.setItemStatus(kot.id, id, 'READY'));
    expect(kot.status).toBe('READY');
    expect(kot.readyAt).toBeTruthy();
    expect(order.orderStatus).toBe('READY');
  });

  it('two lines of the same dish are independent (the exact order line is used, not the dish name)', () => {
    KOTRepository.setItemStatus(kot.id, 'k-oi-2', 'READY');
    expect(order.items.find((i) => i.id === 'oi-2')!.kitchenStatus).toBe('READY');
    expect(order.items.find((i) => i.id === 'oi-3')!.kitchenStatus).toBe('PREPARING');
  });

  it('undo brings a dish back to cooking and raises its revision so it beats older copies', () => {
    KOTRepository.setItemStatus(kot.id, 'k-oi-1', 'READY');
    expect(KOTRepository.setItemStatus(kot.id, 'k-oi-1', 'PREPARING')).toBe(true);
    const l = order.items.find((i) => i.id === 'oi-1')!;
    expect(l.kitchenStatus).toBe('PREPARING');
    expect(l.statusRev).toBe(1);
    expect(kot.items.find((i) => i.id === 'k-oi-1')!.readyAt).toBeUndefined();
  });

  it('recalling a ticket that was marked served puts every dish back to cooking', () => {
    KOTRepository.markKotServed(kot.id);
    expect(kot.status).toBe('SERVED');
    order.orderStatus = 'PREPARING'; // the order itself is still open

    expect(KOTRepository.recallKot(kot.id)).toBe(true);
    expect(kot.status).toBe('PREPARING');
    expect(kot.servedAt).toBeUndefined();
    expect(order.items.every((i) => i.kitchenStatus === 'PREPARING' && (i.statusRev ?? 0) >= 1)).toBe(true);
  });

  it('cannot recall once the order is paid or cancelled', () => {
    KOTRepository.markKotServed(kot.id);
    order.orderStatus = 'COMPLETED';
    expect(KOTRepository.recallKot(kot.id)).toBe(false);
    expect(kot.status).toBe('SERVED');
  });

  it('another device\'s undo (higher revision on the order line) reaches this ticket, and a stale copy does not undo it back', () => {
    KOTRepository.setItemStatus(kot.id, 'k-oi-1', 'READY');
    const l = order.items.find((i) => i.id === 'oi-1')!;
    // The order copy pulled from the cloud says: back to cooking, revision 1.
    l.kitchenStatus = 'PREPARING';
    l.statusRev = 1;
    KOTRepository.reconcileWithOrders();
    expect(kot.items.find((i) => i.id === 'k-oi-1')!.status).toBe('PREPARING');
    expect(kot.items.find((i) => i.id === 'k-oi-1')!.rev).toBe(1);

    // An older copy (revision 0, READY) arrives later and must not win.
    l.kitchenStatus = 'READY';
    l.statusRev = 0;
    KOTRepository.reconcileWithOrders();
    expect(kot.items.find((i) => i.id === 'k-oi-1')!.status).toBe('PREPARING');
  });

  it('an older ticket without line links still follows its order and is never moved back by an old copy', () => {
    const legacyOrder = OrderRepository.createOrder({
      orderType: 'DINE_IN', tableNumber: '5', subtotal: 100, taxAmount: 5, totalAmount: 105, paymentMethod: 'CASH', paymentStatus: 'PENDING', orderStatus: 'PREPARING',
      items: [line('oi-x', 'dal', 'Dal')]
    });
    const [legacy] = KOTRepository.generateKOT({
      orderId: legacyOrder.id, orderNumber: legacyOrder.orderNumber, tokenNumber: legacyOrder.tokenNumber, tableNumber: '5', orderType: 'DINE_IN', cashierName: 'Ravi',
      items: [{ id: 'k-x', menuItemId: 'dal', name: 'Dal', quantity: 1, modifiers: [], kitchenStation: 'Main Kitchen', status: 'PREPARING' as const }]
    });
    legacyOrder.items[0].kitchenStatus = 'READY';
    KOTRepository.reconcileWithOrders();
    expect(legacy.status).toBe('READY');
    legacyOrder.items[0].kitchenStatus = 'PREPARING';
    KOTRepository.reconcileWithOrders();
    expect(legacy.status).toBe('READY');
  });
});

describe('cancelling a dish that was already sent', () => {
  let order: Order;
  let kot: KOTRecord;

  beforeEach(() => {
    db.resetToDefaultSeed();
    db.kots = [];
    db.orders = [];
    order = OrderRepository.createOrder({
      orderType: 'DINE_IN', tableNumber: '6', subtotal: 300, taxAmount: 15, totalAmount: 315, paymentMethod: 'CASH', paymentStatus: 'PENDING', orderStatus: 'PREPARING',
      items: ['a', 'b'].map((id) => ({ id: `oi-${id}`, orderId: '', menuItemId: id, name: id.toUpperCase(), sku: id, quantity: 1, unitPrice: 150, totalPrice: 150, modifiers: [], kitchenStatus: 'PREPARING' as const }))
    });
    [kot] = KOTRepository.generateKOT({
      orderId: order.id, orderNumber: order.orderNumber, tokenNumber: order.tokenNumber, tableNumber: '6', orderType: 'DINE_IN', cashierName: 'Ravi',
      items: order.items.map((i) => ({ id: `k-${i.id}`, menuItemId: i.menuItemId, name: i.name, quantity: 1, modifiers: [], kitchenStation: 'Main Kitchen', status: 'PREPARING' as const, orderItemId: i.id }))
    });
  });

  it('keeps the line at no charge, marks it cancelled with the reason, and cancels its ticket line', () => {
    const updated = KOTRepository.cancelOrderLine(order.id, 'oi-a', 'Guest changed mind', 'Mona');
    expect(updated).toBe(order);
    const l = order.items.find((i) => i.id === 'oi-a')!;
    expect(l).toMatchObject({ kitchenStatus: 'CANCELLED', cancelReason: 'Guest changed mind', unitPrice: 0, totalPrice: 0 });
    expect(l.statusRev).toBe(1);
    // The line drops to zero, but what it was worth, who cancelled it and when are kept so the loss can be reported.
    expect(l).toMatchObject({ cancelledAmount: 150, cancelledBy: 'Mona' });
    expect(Number.isNaN(Date.parse(l.cancelledAt!))).toBe(false);
    expect(kot.items.find((i) => i.id === 'k-oi-a')).toMatchObject({ status: 'CANCELLED', cancelReason: 'Guest changed mind' });
    expect(kot.status).toBe('PREPARING'); // the other dish is still cooking
    expect(order.syncStatus).toBe('SAVED_LOCALLY');
  });

  it('the ticket becomes READY when the only dish left is done, and CANCELLED when every dish is cancelled', () => {
    KOTRepository.cancelOrderLine(order.id, 'oi-a', 'Out of stock');
    KOTRepository.setItemStatus(kot.id, 'k-oi-b', 'READY');
    expect(kot.status).toBe('READY');

    KOTRepository.cancelOrderLine(order.id, 'oi-b', 'Guest left');
    expect(kot.status).toBe('CANCELLED');
    expect(order.orderStatus).toBe('CANCELLED');
  });

  it('a cancelled dish cannot be marked ready, recalled or cancelled twice, and a served one cannot be cancelled', () => {
    KOTRepository.cancelOrderLine(order.id, 'oi-a', 'Out of stock');
    expect(KOTRepository.setItemStatus(kot.id, 'k-oi-a', 'READY')).toBe(false);
    expect(KOTRepository.cancelOrderLine(order.id, 'oi-a', 'again')).toBeNull();

    KOTRepository.setItemStatus(kot.id, 'k-oi-b', 'SERVED');
    expect(KOTRepository.cancelOrderLine(order.id, 'oi-b', 'too late')).toBeNull();
  });

  it('a cancelled dish is not a dish waiting to be served', () => {
    KOTRepository.setItemStatus(kot.id, 'k-oi-a', 'READY');
    KOTRepository.cancelOrderLine(order.id, 'oi-b', 'Out of stock');
    expect(KOTRepository.getFoodReadyItems().map((r) => r.dishName)).toEqual(['A']);
  });
});

describe('the new dish fields travel between devices', () => {
  let cloud: Map<string, CloudSyncedOrder>;
  let pushed: OrderSyncPushEvent[];

  beforeEach(() => {
    db.resetToDefaultSeed();
    db.kots = [];
    db.orders = [];
    cloud = new Map();
    pushed = [];
    SyncOutboxEngine.configureTransport({
      push: async (events: OrderSyncPushEvent[]) => {
        pushed.push(...events);
        return { results: events.map((e) => ({ externalOrderId: e.externalOrderId, status: 'ok' as const, syncVersion: 1 })), serverTime: new Date().toISOString() };
      },
      pull: async () => ({ orders: Array.from(cloud.values()), serverTime: new Date().toISOString() })
    });
  });

  it('a push carries the revision, course and cancel reason of each dish', async () => {
    const order = OrderRepository.createOrder({
      orderType: 'DINE_IN', tableNumber: '7', subtotal: 100, taxAmount: 5, totalAmount: 105, paymentMethod: 'CASH', paymentStatus: 'PENDING', orderStatus: 'PREPARING', syncStatus: 'SAVED_LOCALLY',
      items: [{ id: 'oi-c', orderId: '', menuItemId: 'c', name: 'C', sku: 'c', quantity: 1, unitPrice: 0, totalPrice: 0, modifiers: [], kitchenStatus: 'CANCELLED' as const, statusRev: 2, course: 'COURSE_2', cancelReason: 'Out of stock' }]
    });
    await SyncOutboxEngine.processOutbox();
    const sent = pushed.find((e) => e.externalOrderId === order.id)!;
    expect(sent.items[0]).toMatchObject({ kitchenStatus: 'CANCELLED', statusRev: 2, course: 'COURSE_2', cancelReason: 'Out of stock' });
  });

  it('what a cancelled dish was worth travels in paise and comes back in rupees, with who cancelled it', async () => {
    const order = OrderRepository.createOrder({
      orderType: 'DINE_IN', tableNumber: '9', subtotal: 0, taxAmount: 0, totalAmount: 0, paymentMethod: 'CASH', paymentStatus: 'PENDING', orderStatus: 'PREPARING', syncStatus: 'SAVED_LOCALLY',
      items: [{ id: 'oi-w', orderId: '', menuItemId: 'w', name: 'W', sku: 'w', quantity: 2, unitPrice: 0, totalPrice: 0, modifiers: [], kitchenStatus: 'CANCELLED' as const, statusRev: 1, cancelReason: 'Guest left', cancelledAmount: 240.5, cancelledBy: 'Mona', cancelledAt: '2026-09-28T10:00:00.000Z' }]
    });
    await SyncOutboxEngine.processOutbox();
    const sent = pushed.find((e) => e.externalOrderId === order.id)!;
    expect(sent.items[0]).toMatchObject({ cancelledAmount: 24050, cancelledBy: 'Mona', cancelledAt: '2026-09-28T10:00:00.000Z' });

    cloud.set(order.id, { externalOrderId: order.id, orderType: 'DINE_IN', status: 'PREPARING', tableLabel: '9', subtotal: 0, taxAmount: 0, discountAmount: 0, totalAmount: 0, updatedAt: new Date().toISOString(), items: sent.items as never });
    db.orders = db.orders.filter((o) => o.id !== order.id);
    await SyncOutboxEngine.catchUpFromCloud();
    const pulled = db.orders.find((o) => o.id === order.id)!;
    expect(pulled.items[0]).toMatchObject({ cancelledAmount: 240.5, cancelledBy: 'Mona', cancelledAt: '2026-09-28T10:00:00.000Z', totalPrice: 0 });
    SyncOutboxEngine.configureTransport(null);
  });

  it('a pulled order builds tickets that know their order line and course, and skips cancelled dishes', async () => {
    const remote: CloudSyncedOrder = {
      externalOrderId: 'ord-remote-1', orderType: 'DINE_IN', status: 'PREPARING', tableLabel: '8', subtotal: 10000, taxAmount: 500, discountAmount: 0, totalAmount: 10500, updatedAt: new Date().toISOString(),
      items: [
        { externalItemId: 'oi-r1', menuItemId: 'm1', name: 'Kebab', quantity: 1, unitPrice: 10000, modifiers: [], lineTotal: 10000, kitchenStatus: 'PREPARING', course: 'COURSE_2' },
        { externalItemId: 'oi-r2', menuItemId: 'm2', name: 'Soup', quantity: 1, unitPrice: 0, modifiers: [], lineTotal: 0, kitchenStatus: 'CANCELLED', statusRev: 1, cancelReason: 'Guest left' }
      ]
    };
    cloud.set(remote.externalOrderId, remote);
    await SyncOutboxEngine.catchUpFromCloud();

    const tickets = db.kots.filter((k) => k.orderId === 'ord-remote-1');
    const items = tickets.flatMap((k) => k.items);
    expect(items.map((i) => i.name)).toEqual(['Kebab']);
    expect(items[0]).toMatchObject({ orderItemId: 'oi-r1', course: 'COURSE_2' });
    SyncOutboxEngine.configureTransport(null);
  });

  it('an undo pulled from another device brings the dish back to cooking on this device\'s ticket and order', async () => {
    const order = OrderRepository.createOrder({
      orderType: 'DINE_IN', tableNumber: '9', subtotal: 100, taxAmount: 5, totalAmount: 105, paymentMethod: 'CASH', paymentStatus: 'PENDING', orderStatus: 'PREPARING',
      items: [{ id: 'oi-u', orderId: '', menuItemId: 'u', name: 'U', sku: 'u', quantity: 1, unitPrice: 100, totalPrice: 100, modifiers: [], kitchenStatus: 'PREPARING' as const }]
    });
    order.syncStatus = 'SYNCED';
    const [ticket] = KOTRepository.generateKOT({
      orderId: order.id, orderNumber: order.orderNumber, tokenNumber: order.tokenNumber, tableNumber: '9', orderType: 'DINE_IN', cashierName: 'Ravi',
      items: [{ id: 'k-u', menuItemId: 'u', name: 'U', quantity: 1, modifiers: [], kitchenStation: 'Main Kitchen', status: 'PREPARING' as const, orderItemId: 'oi-u' }]
    });
    KOTRepository.setItemStatus(ticket.id, 'k-u', 'READY');
    order.syncStatus = 'SYNCED';
    expect(ticket.status).toBe('READY');

    cloud.set(order.id, {
      externalOrderId: order.id, orderType: 'DINE_IN', status: 'PREPARING', tableLabel: '9', subtotal: 10000, taxAmount: 500, discountAmount: 0, totalAmount: 10500, updatedAt: new Date(Date.now() + 5000).toISOString(),
      items: [{ externalItemId: 'oi-u', menuItemId: 'u', name: 'U', quantity: 1, unitPrice: 10000, modifiers: [], lineTotal: 10000, kitchenStatus: 'PREPARING', statusRev: 1 }]
    });
    await SyncOutboxEngine.catchUpFromCloud();

    expect(order.items[0]).toMatchObject({ kitchenStatus: 'PREPARING', statusRev: 1 });
    expect(ticket.status).toBe('PREPARING');
    SyncOutboxEngine.configureTransport(null);
  });
});

describe('the real sent and ready times are kept on each order line', () => {
  let order: Order;
  let kot: KOTRecord;

  beforeEach(() => {
    db.resetToDefaultSeed();
    db.kots = [];
    db.orders = [];
    order = OrderRepository.createOrder({
      orderType: 'DINE_IN', tableNumber: '6', subtotal: 300, taxAmount: 15, totalAmount: 315, paymentMethod: 'CASH', paymentStatus: 'PENDING', orderStatus: 'PREPARING',
      items: ['a', 'b'].map((id) => ({ id: `oi-${id}`, orderId: '', menuItemId: id, name: id.toUpperCase(), sku: id, quantity: 1, unitPrice: 150, totalPrice: 150, modifiers: [], kitchenStatus: 'PREPARING' as const }))
    });
    [kot] = KOTRepository.generateKOT({
      orderId: order.id, orderNumber: order.orderNumber, tokenNumber: order.tokenNumber, tableNumber: '6', orderType: 'DINE_IN', cashierName: 'Ravi',
      items: order.items.map((i) => ({ id: `k-${i.id}`, menuItemId: i.menuItemId, name: i.name, quantity: 1, modifiers: [], kitchenStation: 'Main Kitchen', status: 'PREPARING' as const, orderItemId: i.id }))
    });
  });

  it('stamps the send time on every line when the ticket is made', () => {
    for (const l of order.items) expect(l.sentAt).toBe(kot.createdAt);
  });

  it('stamps the done time on a dish when the cook marks it ready, and clears it when the cook undoes it', () => {
    KOTRepository.setItemStatus(kot.id, 'k-oi-a', 'READY');
    const a = order.items.find((i) => i.id === 'oi-a')!;
    expect(Number.isNaN(Date.parse(a.readyAt!))).toBe(false);
    expect(order.items.find((i) => i.id === 'oi-b')!.readyAt).toBeUndefined();
    KOTRepository.setItemStatus(kot.id, 'k-oi-a', 'PREPARING');
    expect(a.readyAt).toBeUndefined();
  });

  it('marking the whole ticket ready stamps every dish', () => {
    KOTRepository.updateKOTStatus(kot.id, 'READY');
    for (const l of order.items) expect(Number.isNaN(Date.parse(l.readyAt!))).toBe(false);
  });
});
