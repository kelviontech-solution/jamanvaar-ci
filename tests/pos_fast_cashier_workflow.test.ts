import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository, MenuRepository, KOTRepository } from '@jamanvaar/database';
import { usePosStore } from '../apps/restaurant-system/pos/src/store/posStore';

describe('JAMANVAAR POS — Ultra-Fast Cashier Billing Workflow & Productivity Engine', () => {
  beforeEach(() => {
    usePosStore.getState().clearCart();
  });

  it('should support 1-tap direct ADD of items into cart without popups', () => {
    const paneerTikka = db.menuItems.find((i) => i.name.includes('Paneer')) || db.menuItems[0];
    expect(paneerTikka).toBeDefined();

    // 1-Tap Add
    usePosStore.getState().addItemToCart(paneerTikka);
    let state = usePosStore.getState();
    expect(state.cart.items.length).toBe(1);
    expect(state.cart.items[0].quantity).toBe(1);

    // 1-Tap Add Again (Increments quantity)
    usePosStore.getState().addItemToCart(paneerTikka);
    state = usePosStore.getState();
    expect(state.cart.items.length).toBe(1);
    expect(state.cart.items[0].quantity).toBe(2);
  });

  it('should allow repeating previous order into a brand-new cart', () => {
    // 1. Create a historical completed order
    const order = OrderRepository.createOrder({
      orderType: 'DINE_IN',
      customerName: 'Aarav Patel',
      customerPhone: '9998887776',
      items: [
        {
          id: 'oi-1',
          orderId: 'ord-test-1',
          menuItemId: db.menuItems[0].id,
          name: db.menuItems[0].name,
          sku: db.menuItems[0].sku,
          unitPrice: db.menuItems[0].price,
          quantity: 2,
          totalPrice: db.menuItems[0].price * 2,
          modifiers: []
        }
      ],
      subtotal: db.menuItems[0].price * 2,
      taxAmount: Math.round(db.menuItems[0].price * 2 * 0.05),
      discountAmount: 0,
      totalAmount: Math.round(db.menuItems[0].price * 2 * 1.05),
      paymentMethod: 'CASH',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED',
      source_type: 'POS'
    });

    // 2. Repeat Order Action
    const freshCart = usePosStore.getState().repeatOrder(order);
    const state = usePosStore.getState();

    expect(freshCart.items.length).toBe(1);
    expect(freshCart.items[0].quantity).toBe(2);
    expect(freshCart.items[0].item.name).toBe(db.menuItems[0].name);
    expect(state.selectedCustomer?.name).toBe('Aarav Patel');
  });

  it('should support Repeat Last Order action', () => {
    const freshCart = usePosStore.getState().repeatLastOrder();
    expect(freshCart).toBeDefined();
    expect(freshCart?.items.length).toBeGreaterThan(0);
  });

  it('should route items correctly to Kitchen Stations during KOT', () => {
    const tandoorItem = db.menuItems.find((i) => i.kitchenStation === 'Tandoor') || db.menuItems[0];
    usePosStore.getState().addItemToCart(tandoorItem);

    const kots = usePosStore.getState().sendKOT();
    expect(kots).toBeDefined();
    expect(kots?.length).toBeGreaterThan(0);
    expect(kots?.[0].items[0].kitchenStation).toBe(tandoorItem.kitchenStation || 'Main Kitchen');
  });
});
