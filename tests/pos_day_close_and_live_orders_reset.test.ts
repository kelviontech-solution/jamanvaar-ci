import { describe, it, expect, beforeEach } from 'vitest';
import { db, BusinessDayRepository, OrderRepository } from '@jamanvaar/database';

describe('JAMANVAAR POS — Day Close, Shift Reset & Live Orders Scoping', () => {
  beforeEach(() => {
    // Reset test state
  });

  it('verifies that active business day groups live orders and closeBusinessDay finalizes them safely', () => {
    const activeDay = BusinessDayRepository.getActiveBusinessDay();
    expect(activeDay).toBeDefined();
    expect(activeDay.status).toBe('OPEN');

    // Create an order in active day
    const testOrder = OrderRepository.createOrder({
      orderNumber: 'TEST-RESET-01',
      totalAmount: 450,
      orderStatus: 'COMPLETED',
      paymentMethod: 'CASH',
      paymentStatus: 'SUCCESS'
    });

    expect(testOrder.businessDayId).toBe(activeDay.id);

    const ordersForDay = BusinessDayRepository.getOrdersForBusinessDay(activeDay.id);
    expect(ordersForDay.some((o) => o.id === testOrder.id)).toBe(true);

    // Close the day
    const closed = BusinessDayRepository.closeBusinessDay(
      activeDay.id,
      activeDay.openingCash + 450,
      'Test Cashier'
    );

    expect(closed.status).toBe('CLOSED');
    expect(closed.snapshot).toBeDefined();

    // Verify orders were NOT deleted
    const allDbOrders = db.orders;
    expect(allDbOrders.some((o) => o.id === testOrder.id)).toBe(true);

    // Open a new business day for next shift
    const nextDay = BusinessDayRepository.openNewBusinessDay('Next Cashier', 2000);
    expect(nextDay.status).toBe('OPEN');
    expect(nextDay.id).not.toBe(activeDay.id);

    // The new day has 0 orders initially
    const nextDayOrders = BusinessDayRepository.getOrdersForBusinessDay(nextDay.id);
    expect(nextDayOrders.length).toBe(0);

    // Verify past day orders are still safely retrievable
    const pastDayOrders = BusinessDayRepository.getOrdersForBusinessDay(activeDay.id);
    expect(pastDayOrders.length).toBeGreaterThan(0);
  });
});
