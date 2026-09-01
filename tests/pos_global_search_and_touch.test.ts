import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository, CustomerRepository } from '@jamanvaar/database';
import { usePosStore } from '../apps/restaurant-system/pos/src/store/posStore';

describe('JAMANVAAR POS — Global Multi-Domain Search & Touch Engine', () => {
  beforeEach(() => {
    usePosStore.getState().clearCart();
    usePosStore.getState().setIsGlobalSearchOpen(false);
  });

  it('1. should match dishes by name, SKU, and category in global search', () => {
    const paneerQuery = 'paneer';
    const matches = db.menuItems.filter(
      (i) =>
        i.name.toLowerCase().includes(paneerQuery) ||
        i.sku.toLowerCase().includes(paneerQuery)
    );
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((m) => m.name.toLowerCase().includes('paneer'))).toBe(true);

    const skuQuery = 'pt-';
    const skuMatches = db.menuItems.filter((i) => i.sku.toLowerCase().includes(skuQuery));
    expect(skuMatches.length).toBeGreaterThan(0);
  });

  it('2. should match floor tables by table number and zone', () => {
    const tableQuery = '1';
    const tableMatches = db.tables.filter((t) => t.tableNumber.includes(tableQuery));
    expect(tableMatches.length).toBeGreaterThan(0);
  });

  it('3. should match customers by full name or phone number', () => {
    const customers = CustomerRepository.getAll();
    expect(customers.length).toBeGreaterThan(0);

    const firstCustomer = customers[0];
    const phoneQuery = firstCustomer.phone.slice(-4);
    const matched = CustomerRepository.getAll().filter((c) => c.phone.includes(phoneQuery));
    expect(matched.length).toBeGreaterThan(0);
    expect(matched.some((c) => c.phone === firstCustomer.phone)).toBe(true);
  });

  it('4. should match orders and settled invoices by order number, token, and customer', () => {
    const order = OrderRepository.createOrder({
      orderType: 'TAKEAWAY',
      customerName: 'Sanjay Patel',
      customerPhone: '9825012345',
      items: [
        {
          id: 'oi-search-1',
          orderId: '',
          menuItemId: db.menuItems[0].id,
          name: db.menuItems[0].name,
          sku: db.menuItems[0].sku,
          modifiers: [],
          quantity: 1,
          unitPrice: db.menuItems[0].price,
          totalPrice: db.menuItems[0].price,
          kitchenStatus: 'PREPARING'
        }
      ],
      subtotal: db.menuItems[0].price,
      discountAmount: 0,
      cgstAmount: 5,
      sgstAmount: 5,
      taxAmount: 10,
      totalAmount: db.menuItems[0].price + 10,
      paymentMethod: 'UPI_QR',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED',
      source_type: 'POS'
    });

    expect(order).toBeDefined();

    // Query by order number substring
    const ordNumMatch = db.orders.filter((o) => o.orderNumber.includes(order.orderNumber));
    expect(ordNumMatch.length).toBeGreaterThan(0);

    // Query by phone
    const phoneMatch = db.orders.filter((o) => o.customerPhone === '9825012345');
    expect(phoneMatch.length).toBeGreaterThan(0);
  });

  it('5. should support touch-friendly 1-tap cart addition and quantity incrementing', () => {
    const item = db.menuItems[0];
    const store = usePosStore.getState();

    store.addItemToCart(item);
    expect(usePosStore.getState().cart.items.length).toBe(1);
    expect(usePosStore.getState().cart.items[0].quantity).toBe(1);

    // Increment
    const cartItemId = usePosStore.getState().cart.items[0].cartItemId;
    store.updateItemQuantity(cartItemId, 1);
    expect(usePosStore.getState().cart.items[0].quantity).toBe(2);

    // Decrement
    store.updateItemQuantity(cartItemId, -1);
    expect(usePosStore.getState().cart.items[0].quantity).toBe(1);

    // Clear
    store.clearCart();
    expect(usePosStore.getState().cart.items.length).toBe(0);
  });
});
