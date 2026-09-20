import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository } from '@jamanvaar/database';
import { SyncOutboxEngine } from '@jamanvaar/sync';

/**
 * BUG-038: an order paid straight from POS (no "Send KOT" first) was created
 * with syncStatus 'SYNCED' by default, so the outbox (which only pushes
 * SAVED_LOCALLY / FAILED orders) never sent it to the cloud. Settling an
 * order also never re-flagged it, so the cloud copy stayed "PREPARING"
 * forever. Nothing downstream (KDS, Restaurant Admin, Super Admin) could see
 * these orders.
 */
describe('order → cloud sync flagging (BUG-038)', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    SyncOutboxEngine.configureTransport(null);
  });

  function item(quantity = 1) {
    const menuItem = db.menuItems[0];
    return {
      id: `oi-${Date.now()}-${Math.random()}`,
      orderId: '',
      menuItemId: menuItem.id,
      name: menuItem.name,
      sku: menuItem.sku || 'SKU',
      quantity,
      unitPrice: menuItem.price,
      modifiers: [],
      totalPrice: menuItem.price * quantity,
      kitchenStatus: 'PENDING' as const
    };
  }

  it('flags a locally created order for cloud sync when the caller does not say otherwise', () => {
    const it1 = item(2);
    const order = OrderRepository.createOrder({
      items: [it1],
      subtotal: it1.totalPrice,
      totalAmount: it1.totalPrice,
      source_type: 'POS'
    });
    expect(order.syncStatus).toBe('SAVED_LOCALLY');
    expect(order.isSynced).toBe(false);
  });

  it('still honours an explicit SYNCED status (an order mirrored from the cloud)', () => {
    const it1 = item(1);
    const order = OrderRepository.createOrder({
      items: [it1],
      subtotal: it1.totalPrice,
      totalAmount: it1.totalPrice,
      source_type: 'POS',
      syncStatus: 'SYNCED',
      isSynced: true
    });
    expect(order.syncStatus).toBe('SYNCED');
  });

  it('re-flags an already-synced order for sync when it is settled, so the paid state reaches the cloud', () => {
    const it1 = item(1);
    const order = OrderRepository.createOrder({
      items: [it1],
      subtotal: it1.totalPrice,
      totalAmount: it1.totalPrice,
      source_type: 'POS',
      orderStatus: 'PREPARING',
      paymentStatus: 'PENDING',
      syncStatus: 'SYNCED',
      isSynced: true
    });
    const settled = OrderRepository.settleOrder(order.id, 'CASH', order.totalAmount, 'TXN-1', 'Cashier');
    expect(settled?.orderStatus).toBe('COMPLETED');
    expect(settled?.syncStatus).toBe('SAVED_LOCALLY');
    expect(settled?.isSynced).toBe(false);
  });

  it('pushes a directly-paid order through the outbox with its final status', async () => {
    const pushed: Array<{ externalOrderId: string; status: string }> = [];
    SyncOutboxEngine.configureTransport({
      push: async (events) => {
        events.forEach((e) => pushed.push({ externalOrderId: e.externalOrderId, status: e.status }));
        return {
          results: events.map((e) => ({ externalOrderId: e.externalOrderId, status: 'ok' as const, syncVersion: 1 })),
          serverTime: new Date().toISOString()
        };
      },
      pull: async () => ({ orders: [], serverTime: new Date().toISOString() })
    });

    const it1 = item(1);
    const order = OrderRepository.createOrder({
      items: [it1],
      subtotal: it1.totalPrice,
      totalAmount: it1.totalPrice,
      source_type: 'POS',
      orderStatus: 'COMPLETED',
      paymentStatus: 'SUCCESS'
    });

    const result = await SyncOutboxEngine.processOutbox();

    expect(result.processed).toBeGreaterThanOrEqual(1);
    expect(pushed.map((p) => p.externalOrderId)).toContain(order.id);
    expect(db.orders.find((o) => o.id === order.id)?.syncStatus).toBe('SYNCED');
    SyncOutboxEngine.configureTransport(null);
  });
});
