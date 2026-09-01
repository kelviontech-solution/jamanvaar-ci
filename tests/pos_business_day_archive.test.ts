import { describe, it, expect, beforeEach } from 'vitest';
import { db, OrderRepository, BusinessDayRepository, AuditRepository } from '@jamanvaar/database';

describe('JAMANVAAR POS — Business Day & Daily Order Archive System', () => {
  beforeEach(() => {
    db.orders = [];
    db.businessDays = [];
    db.auditLogs = [];
  });

  it('1. should automatically initialize and assign active businessDayId on every new order', () => {
    const activeDay = BusinessDayRepository.getActiveBusinessDay();
    expect(activeDay).toBeDefined();
    expect(activeDay.status).toBe('OPEN');
    expect(activeDay.id).toContain('BD-');

    // Create a new order without explicit businessDayId
    const order1 = OrderRepository.createOrder({
      orderType: 'DINE_IN',
      tableNumber: 'T-01',
      items: [
        {
          id: 'oi-1',
          orderId: '',
          menuItemId: 'dish-paneer-tikka',
          name: 'Paneer Tikka',
          sku: 'PT-01',
          modifiers: [],
          quantity: 2,
          unitPrice: 280,
          totalPrice: 560,
          kitchenStatus: 'SERVED'
        }
      ],
      subtotal: 560,
      discountAmount: 0,
      cgstAmount: 14,
      sgstAmount: 14,
      taxAmount: 28,
      totalAmount: 588,
      paymentMethod: 'CASH',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED',
      source_type: 'POS'
    });

    expect(order1.businessDayId).toBe(activeDay.id);

    // Verify day metrics recalculated automatically
    const updatedDay = BusinessDayRepository.getBusinessDayById(activeDay.id);
    expect(updatedDay?.orderCount).toBe(1);
    expect(updatedDay?.netSales).toBe(588);
    expect(updatedDay?.cashSales).toBe(588);
  });

  it('2. should accurately aggregate multiple channel orders (POS, Kiosk, Captain) under one BusinessDay', () => {
    const activeDay = BusinessDayRepository.getActiveBusinessDay();

    // 1. POS Dine-in Cash
    OrderRepository.createOrder({
      orderType: 'DINE_IN',
      source_type: 'POS',
      items: [{ id: 'i-1', orderId: '', menuItemId: 'm-1', name: 'Dal Tadka', sku: 'DT-1', modifiers: [], quantity: 1, unitPrice: 200, totalPrice: 200, kitchenStatus: 'SERVED' }],
      totalAmount: 210,
      paymentMethod: 'CASH',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED'
    });

    // 2. Kiosk Takeaway UPI
    OrderRepository.createOrder({
      orderType: 'TAKEAWAY',
      source_type: 'KIOSK',
      items: [{ id: 'i-2', orderId: '', menuItemId: 'm-2', name: 'Butter Naan', sku: 'BN-1', modifiers: [], quantity: 4, unitPrice: 40, totalPrice: 160, kitchenStatus: 'SERVED' }],
      totalAmount: 168,
      paymentMethod: 'UPI',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED'
    });

    // 3. Captain Dine-in Card
    OrderRepository.createOrder({
      orderType: 'DINE_IN',
      source_type: 'CAPTAIN',
      items: [{ id: 'i-3', orderId: '', menuItemId: 'm-3', name: 'Paneer Butter Masala', sku: 'PBM-1', modifiers: [], quantity: 1, unitPrice: 300, totalPrice: 300, kitchenStatus: 'SERVED' }],
      totalAmount: 315,
      paymentMethod: 'CARD',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED'
    });

    const dayOrders = BusinessDayRepository.getOrdersForBusinessDay(activeDay.id);
    expect(dayOrders.length).toBe(3);

    const day = BusinessDayRepository.getBusinessDayById(activeDay.id)!;
    expect(day.orderCount).toBe(3);
    expect(day.netSales).toBe(693); // 210 + 168 + 315
    expect(day.cashSales).toBe(210);
    expect(day.upiSales).toBe(168);
    expect(day.cardSales).toBe(315);
    expect(day.dineInCount).toBe(2);
    expect(day.takeawayCount).toBe(1);
  });

  it('3. should run pre-closing check and detect active in-progress or unpaid orders', () => {
    const activeDay = BusinessDayRepository.getActiveBusinessDay();

    // 1 Completed Order
    OrderRepository.createOrder({
      orderType: 'DINE_IN',
      items: [{ id: 'i-1', orderId: '', menuItemId: 'm-1', name: 'Lassi', sku: 'L-1', modifiers: [], quantity: 1, unitPrice: 100, totalPrice: 100, kitchenStatus: 'SERVED' }],
      totalAmount: 105,
      paymentMethod: 'CASH',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED'
    });

    // 1 In-Progress Preparing Order
    OrderRepository.createOrder({
      orderType: 'DINE_IN',
      items: [{ id: 'i-2', orderId: '', menuItemId: 'm-2', name: 'Biryani', sku: 'B-1', modifiers: [], quantity: 1, unitPrice: 250, totalPrice: 250, kitchenStatus: 'PREPARING' }],
      totalAmount: 262.5,
      paymentMethod: 'UPI',
      paymentStatus: 'PENDING',
      orderStatus: 'PREPARING'
    });

    const check = BusinessDayRepository.startDayClosing(activeDay.id);
    expect(check.day.status).toBe('CLOSING');
    expect(check.activeOrdersCount).toBe(1);
    expect(check.unpaidOrdersCount).toBe(1);
  });

  it('4. should execute Close Business Day with cash drawer variance calculation, snapshotting, and audit trail', () => {
    const activeDay = BusinessDayRepository.getActiveBusinessDay();
    activeDay.openingCash = 2000;
    activeDay.cashIn = 500;
    activeDay.cashOut = 100;

    // Add Cash Sale of 1000
    OrderRepository.createOrder({
      orderType: 'TAKEAWAY',
      items: [{ id: 'i-1', orderId: '', menuItemId: 'm-1', name: 'Thali', sku: 'TH-1', modifiers: [], quantity: 2, unitPrice: 500, totalPrice: 1000, kitchenStatus: 'SERVED' }],
      totalAmount: 1050,
      paymentMethod: 'CASH',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED'
    });

    // Expected Cash = 2000 (opening) + 1050 (sales) + 500 (in) - 100 (out) = 3450
    const actualCashCounted = 3440; // Short by ₹10
    const varianceReason = 'Cash change rounding discrepancy';

    const closedDay = BusinessDayRepository.closeBusinessDay(
      activeDay.id,
      actualCashCounted,
      'Cashier Amit',
      varianceReason
    );

    expect(closedDay.status).toBe('CLOSED');
    expect(closedDay.closedBy).toBe('Cashier Amit');
    expect(closedDay.closedAt).toBeDefined();
    expect(closedDay.expectedCash).toBe(3450);
    expect(closedDay.closingCash).toBe(3440);
    expect(closedDay.cashVariance).toBe(-10);
    expect(closedDay.varianceReason).toBe(varianceReason);

    // Verify snapshot created
    expect(closedDay.snapshot).toBeDefined();
    expect(closedDay.snapshot?.netSalesSnapshot).toBe(1050);
    expect(closedDay.snapshot?.cashDrawerSnapshot.actualCash).toBe(3440);
    expect(closedDay.snapshot?.cashDrawerSnapshot.variance).toBe(-10);

    // Verify audit log
    const audit = db.auditLogs.find((a) => a.action === 'DAY_CLOSED');
    expect(audit).toBeDefined();
    expect(audit?.details).toContain(closedDay.id);
  });

  it('5. should open a new business day after closing and isolate previous day orders permanently', () => {
    const day1 = BusinessDayRepository.getActiveBusinessDay();
    OrderRepository.createOrder({
      orderType: 'TAKEAWAY',
      businessDayId: day1.id,
      items: [{ id: 'i-1', orderId: '', menuItemId: 'm-1', name: 'Item Day 1', sku: 'I1', modifiers: [], quantity: 1, unitPrice: 100, totalPrice: 100, kitchenStatus: 'SERVED' }],
      totalAmount: 105,
      paymentMethod: 'CASH',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED'
    });

    // Close Day 1
    BusinessDayRepository.closeBusinessDay(day1.id, 2105, 'Cashier Amit');

    // Open Day 2
    const day2 = BusinessDayRepository.openNewBusinessDay('Cashier Rahul', 2105);
    expect(day2.id).not.toBe(day1.id);
    expect(day2.status).toBe('OPEN');
    expect(day2.openingCash).toBe(2105);

    // Add Order on Day 2
    OrderRepository.createOrder({
      orderType: 'DINE_IN',
      businessDayId: day2.id,
      items: [{ id: 'i-2', orderId: '', menuItemId: 'm-2', name: 'Item Day 2', sku: 'I2', modifiers: [], quantity: 1, unitPrice: 500, totalPrice: 500, kitchenStatus: 'SERVED' }],
      totalAmount: 525,
      paymentMethod: 'UPI',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED'
    });

    // Verify Day 1 orders are completely separated from Day 2
    const day1Orders = BusinessDayRepository.getOrdersForBusinessDay(day1.id);
    const day2Orders = BusinessDayRepository.getOrdersForBusinessDay(day2.id);

    expect(day1Orders.length).toBe(1);
    expect(day1Orders[0].items[0].name).toBe('Item Day 1');

    expect(day2Orders.length).toBe(1);
    expect(day2Orders[0].items[0].name).toBe('Item Day 2');
  });

  it('6. should allow admin to reopen a closed business day with reason and audit trail', () => {
    const day = BusinessDayRepository.getActiveBusinessDay();
    BusinessDayRepository.closeBusinessDay(day.id, 2000, 'Cashier Amit');
    expect(day.status).toBe('CLOSED');

    const reopened = BusinessDayRepository.reopenBusinessDay(
      day.id,
      'Restaurant Manager',
      'Manager override to fix cash bill entry'
    );

    expect(reopened?.status).toBe('REOPENED');
    expect(reopened?.reopenedBy).toBe('Restaurant Manager');
    expect(reopened?.reopenReason).toContain('fix cash bill entry');

    const audit = db.auditLogs.find((a) => a.action === 'DAY_REOPENED');
    expect(audit).toBeDefined();
    expect(audit?.details).toContain('Manager override');
  });
});
