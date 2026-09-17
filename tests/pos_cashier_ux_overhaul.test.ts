import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository, HeldOrderRepository } from '@jamanvaar/database';
import { usePosStore } from '../apps/restaurant-system/pos/src/store/posStore';

describe('JAMANVAAR POS — Cashier UX Polish & Workflows', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    usePosStore.getState().clearCart();
  });

  it('1. should add items directly to cart and calculate correct taxes and round off', () => {
    const item1 = db.menuItems.find((i) => i.name.toLowerCase().includes('butter naan')) || db.menuItems[0];
    const item2 = db.menuItems.find((i) => i.name.toLowerCase().includes('dal makhani')) || db.menuItems[1];

    usePosStore.getState().addItemToCart(item1, [], '', 2);
    usePosStore.getState().addItemToCart(item2, [], '', 1);

    const cart = usePosStore.getState().cart;
    expect(cart.items.length).toBe(2);

    const expectedSubtotal = item1.price * 2 + item2.price * 1;
    expect(cart.subtotal).toBe(expectedSubtotal);

    expect(cart.taxAmount).toBe(cart.cgstAmount + cart.sgstAmount);
    expect(cart.totalPayable).toBe(Math.round(cart.subtotal + cart.taxAmount));
  });

  it('2. should hold current order and recall it without data loss', () => {
    const item = db.menuItems[0];
    usePosStore.getState().addItemToCart(item, [], 'Extra crispy', 3);
    usePosStore.getState().setOrderNotes('Table anniversary');

    const payableBeforeHold = usePosStore.getState().cart.totalPayable;
    expect(payableBeforeHold).toBeGreaterThan(0);

    // Hold order
    const held = usePosStore.getState().holdCurrentOrder('Guest Hold #101');
    expect(held).toBe(true);
    expect(usePosStore.getState().cart.items.length).toBe(0);

    // Verify held order in db
    const allHeld = HeldOrderRepository.getAllHeld();
    expect(allHeld.length).toBeGreaterThan(0);
    const lastHeld = allHeld[0];
    expect(lastHeld.totalAmount).toBe(payableBeforeHold);

    // Recall order
    const recalled = usePosStore.getState().recallHeldOrder(lastHeld.id);
    expect(recalled).toBe(true);
    expect(usePosStore.getState().cart.items.length).toBe(1);
    expect(usePosStore.getState().cart.totalPayable).toBe(payableBeforeHold);
    expect(usePosStore.getState().orderNotes).toBe('Table anniversary');
  });

  it('3. should support repeating previous order accurately', () => {
    // Create a real order to repeat (no more ambient fabricated seed orders)
    const item = db.menuItems[0];
    const existingOrder = OrderRepository.createOrder({
      orderType: 'TAKEAWAY',
      items: [
        {
          id: 'oi-repeat-1',
          orderId: '',
          menuItemId: item.id,
          name: item.name,
          sku: item.sku,
          quantity: 1,
          unitPrice: item.price,
          modifiers: [],
          totalPrice: item.price,
          kitchenStatus: 'SERVED'
        }
      ],
      subtotal: item.price,
      taxAmount: 0,
      totalAmount: item.price,
      paymentMethod: 'CASH',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED',
      source_type: 'POS'
    });
    expect(existingOrder).toBeDefined();

    // Call repeatOrder
    const repeatedCart = usePosStore.getState().repeatOrder(existingOrder);
    expect(repeatedCart).toBeDefined();
    expect(repeatedCart.items.length).toBe(existingOrder.items.length);
    expect(usePosStore.getState().cart.items.length).toBe(existingOrder.items.length);
  });

  it('4. should process Instant Bill checkout cleanly and clear the cart', async () => {
    const item = db.menuItems[0];
    usePosStore.getState().addItemToCart(item, [], '', 1);
    const payable = usePosStore.getState().cart.totalPayable;

    const settled = await usePosStore.getState().executeInstantBill('CASH');
    expect(settled).toBeDefined();
    expect(settled?.orderStatus).toBe('COMPLETED');
    expect(settled?.paymentStatus).toBe('SUCCESS');
    expect(settled?.totalAmount).toBe(payable);

    // Cart must be empty ready for next customer
    expect(usePosStore.getState().cart.items.length).toBe(0);
  });

  it('5. should support quick increment and decrement stepping for items in cart', () => {
    const item = db.menuItems[0];
    usePosStore.getState().addItemToCart(item, [], '', 1);

    let inCartCount = usePosStore.getState().cart.items
      .filter((i) => i.menuItemId === item.id)
      .reduce((sum, it) => sum + it.quantity, 0);
    expect(inCartCount).toBe(1);

    // Increment (add another 1)
    usePosStore.getState().addItemToCart(item);
    inCartCount = usePosStore.getState().cart.items
      .filter((i) => i.menuItemId === item.id)
      .reduce((sum, it) => sum + it.quantity, 0);
    expect(inCartCount).toBe(2);

    // Decrement by 1
    const cartItem = usePosStore.getState().cart.items.find((i) => i.menuItemId === item.id);
    expect(cartItem).toBeDefined();
    usePosStore.getState().updateItemQuantity(cartItem!.cartItemId, -1);

    inCartCount = usePosStore.getState().cart.items
      .filter((i) => i.menuItemId === item.id)
      .reduce((sum, it) => sum + it.quantity, 0);
    expect(inCartCount).toBe(1);

    // Decrement to 0 (removes item from cart)
    usePosStore.getState().updateItemQuantity(cartItem!.cartItemId, -1);
    inCartCount = usePosStore.getState().cart.items
      .filter((i) => i.menuItemId === item.id)
      .reduce((sum, it) => sum + it.quantity, 0);
    expect(inCartCount).toBe(0);
    expect(usePosStore.getState().cart.items.length).toBe(0);
  });
});
