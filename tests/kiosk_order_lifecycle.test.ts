import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, KOTRepository, OrderRepository } from '@jamanvaar/database';
import { SyncOutboxEngine } from '@jamanvaar/sync';
import { cancelAbandonedKioskDraft, confirmKioskCashOrder } from '../apps/kiosk-system/kiosk-user/src/kioskOrderLifecycle';

describe('shared kiosk checkout lifecycle', () => {
  beforeEach(() => { db.resetToDefaultSeed(); SyncOutboxEngine.configureTransport(null); });
  afterEach(() => SyncOutboxEngine.configureTransport(null));
  function draft() {
    const menu = db.menuItems[0];
    return OrderRepository.createOrder({ source_type: 'KIOSK', orderStatus: 'DRAFT', paymentStatus: 'PENDING', paymentMethod: 'UPI',
      items: [{ id: 'line-1', orderId: '', menuItemId: menu.id, name: menu.name, sku: menu.sku || '', quantity: 1, unitPrice: menu.price, totalPrice: menu.price, modifiers: [], kitchenStatus: 'PENDING' }],
      subtotal: menu.price, totalAmount: menu.price });
  }
  it('abandons an unsubmitted unpaid draft without admitting a kitchen ticket', () => {
    const order = draft(); cancelAbandonedKioskDraft(order.id);
    expect(OrderRepository.getOrderById(order.id)?.orderStatus).toBe('CANCELLED');
    expect(KOTRepository.getKOTsForOrder(order.id)).toHaveLength(0);
  });
  it('returns the confirmed saved cash order, not the old draft snapshot', () => {
    const order = draft(), confirmed = confirmKioskCashOrder(order.id)!;
    expect(confirmed).toBe(OrderRepository.getOrderById(order.id));
    expect(confirmed.orderStatus).toBe('CONFIRMED');
    expect(confirmed.paymentMethod).toBe('CASH_AT_COUNTER');
    expect(confirmed.paymentStatus).toBe('PENDING');
    expect(confirmed).not.toBe(order);
  });
  it('welcome reset and repeated reset preserve accepted unpaid cash through ready and served', () => {
    const order = confirmKioskCashOrder(draft().id)!;
    const [kot] = KOTRepository.generateKOT({ orderId: order.id, orderNumber: order.orderNumber, tokenNumber: order.tokenNumber, orderType: order.orderType, cashierName: 'Kiosk',
      items: order.items.map(i => ({ ...i, orderItemId: i.id, kitchenStation: 'Main Kitchen', status: 'PREPARING' })) });
    for (const stage of ['PREPARING', 'READY', 'SERVED'] as const) {
      KOTRepository.updateKOTStatus(kot.id, stage);
      cancelAbandonedKioskDraft(order.id); cancelAbandonedKioskDraft(order.id);
      KOTRepository.reconcileWithOrders();
      expect(OrderRepository.getOrderById(order.id)?.orderStatus).not.toBe('CANCELLED');
      expect(OrderRepository.getOrderById(order.id)?.paymentStatus).toBe('PENDING');
      expect(kot.status).toBe(stage);
      expect(OrderRepository.getOrderById(order.id)?.items[0].kitchenStatus).toBe(stage);
    }
  });
  it('does not abandon a settled draft or confirm the same checkout twice', () => {
    const order = draft(); OrderRepository.updateOrder(order.id, { paymentStatus: 'SUCCESS' });
    cancelAbandonedKioskDraft(order.id);
    expect(OrderRepository.getOrderById(order.id)?.orderStatus).toBe('DRAFT');
    const cash = confirmKioskCashOrder(draft().id)!;
    expect(confirmKioskCashOrder(cash.id)).toBeNull();
  });
  it('flush sends accepted unpaid cash immediately without advancing a timer', async () => {
    const pushed: Array<{ status: string; paymentStatus?: string }> = [];
    SyncOutboxEngine.configureTransport({
      push: async events => { pushed.push(...events); return { results: events.map(e => ({ externalOrderId: e.externalOrderId, status: 'ok' as const, syncVersion: 1 })), serverTime: new Date().toISOString() }; },
      pull: async () => ({ orders: [], serverTime: new Date().toISOString() })
    });
    const order = confirmKioskCashOrder(draft().id)!;
    SyncOutboxEngine.flush();
    await expect.poll(() => pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PENDING' });
    cancelAbandonedKioskDraft(order.id);
    expect(OrderRepository.getOrderById(order.id)?.orderStatus).toBe('CONFIRMED');
  });
});
