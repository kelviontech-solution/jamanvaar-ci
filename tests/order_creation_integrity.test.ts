import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository } from '@jamanvaar/database';

/**
 * Regression suite for three data-integrity gaps found in the platform audit:
 * 1. OrderRepository.createOrder trusted a caller-supplied `subtotal` with no
 *    recomputation from the order's own items — a caller (bypassing the UI's
 *    own tested cart math) could submit real items with a fabricated total.
 * 2. `idempotencyKey` was generated and stored but never checked before
 *    insert — a retried submit created a second order, not a no-op.
 * 3. `generateOrderNumber()` drew from a 9,000-value keyspace with no
 *    collision check.
 */
describe('OrderRepository.createOrder data integrity', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
  });

  function realItem(quantity = 1) {
    const menuItem = db.menuItems[0];
    return {
      id: `oi-test-${Date.now()}-${Math.random()}`,
      orderId: 'ord-test',
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

  it('rejects a subtotal fabricated far below what the order items actually cost', () => {
    const item = realItem(3); // real cost e.g. 3 * price

    expect(() =>
      OrderRepository.createOrder({
        items: [item],
        subtotal: 1, // fabricated — nowhere near 3x the real item price
        totalAmount: 1,
        source_type: 'POS'
      })
    ).toThrow(/lower than the actual cost/i);
  });

  it('accepts a correct subtotal that matches the sum of item totals', () => {
    const item = realItem(2);
    const order = OrderRepository.createOrder({
      items: [item],
      subtotal: item.totalPrice,
      totalAmount: item.totalPrice,
      source_type: 'POS'
    });
    expect(order.subtotal).toBe(item.totalPrice);
  });

  it('fills in the correct subtotal from items when the caller omits it entirely', () => {
    const item = realItem(4);
    const order = OrderRepository.createOrder({
      items: [item],
      source_type: 'POS'
    });
    expect(order.subtotal).toBe(item.totalPrice);
  });

  it('a discounted order (subtotal = raw item cost, totalAmount lower) is still accepted', () => {
    const item = realItem(1);
    const order = OrderRepository.createOrder({
      items: [item],
      subtotal: item.totalPrice,
      discountAmount: item.totalPrice * 0.5,
      totalAmount: item.totalPrice * 0.5,
      source_type: 'POS'
    });
    expect(order.subtotal).toBe(item.totalPrice);
    expect(order.totalAmount).toBe(item.totalPrice * 0.5);
  });

  it('a duplicate submission with the same idempotencyKey returns the original order, not a new one', () => {
    const item = realItem(1);
    const key = `idem-test-${Date.now()}`;
    const countBefore = db.orders.length;

    const first = OrderRepository.createOrder({
      items: [item],
      subtotal: item.totalPrice,
      totalAmount: item.totalPrice,
      idempotencyKey: key,
      source_type: 'POS'
    });

    const second = OrderRepository.createOrder({
      items: [item],
      subtotal: item.totalPrice,
      totalAmount: item.totalPrice,
      idempotencyKey: key,
      source_type: 'POS'
    });

    expect(second.id).toBe(first.id);
    expect(db.orders.length).toBe(countBefore + 1); // only one order actually created
  });

  it('generates a unique order number for a large batch with no collisions', () => {
    const item = realItem(1);
    const numbers = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const order = OrderRepository.createOrder({
        items: [item],
        subtotal: item.totalPrice,
        totalAmount: item.totalPrice,
        source_type: 'POS'
      });
      numbers.add(order.orderNumber);
    }
    expect(numbers.size).toBe(200);
  });
});
