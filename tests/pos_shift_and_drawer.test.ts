import { describe, it, expect, beforeEach } from 'vitest';
import { db, ShiftRepository, OrderRepository, AuditRepository } from '@jamanvaar/database';

describe('JAMANVAAR POS — Shift & Cash Management System', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
    db.shifts = [];
    db.cashMovements = [];
    db.orders = [];
    db.auditLogs = [];
  });

  it('1. should open cashier shift with starting float and log audit entry', () => {
    const shift = ShiftRepository.openShift('usr-cashier-1', 'Amit Dave', 2000, 'POS-01', 'Starting morning shift');

    expect(shift).toBeDefined();
    expect(shift.status).toBe('OPEN');
    expect(shift.openingCash).toBe(2000);
    expect(shift.expectedCash).toBe(2000);
    expect(shift.totalSales).toBe(0);

    const audit = db.auditLogs.find((a) => a.action === 'SHIFT_OPEN');
    expect(audit).toBeDefined();
    expect(audit?.details).toContain('₹2000');
  });

  it('2. should automatically update active shift metrics when cash, UPI and split orders are created', () => {
    const shift = ShiftRepository.openShift('usr-cashier-1', 'Amit Dave', 2000, 'POS-01');

    // Test 2: Create ₹500 Cash order
    OrderRepository.createOrder({
      orderType: 'DINE_IN',
      items: [{ id: 'i-1', orderId: '', menuItemId: 'm-1', name: 'Paneer Tikka', sku: 'PT-1', modifiers: [], quantity: 1, unitPrice: 500, totalPrice: 500, kitchenStatus: 'SERVED' }],
      totalAmount: 500,
      paymentMethod: 'CASH',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED'
    });

    const active1 = ShiftRepository.getActiveShift()!;
    expect(active1.totalCashSales).toBe(500);
    expect(active1.totalSales).toBe(500);
    expect(active1.expectedCash).toBe(2500); // 2000 + 500

    // Test 3: Create ₹500 UPI order
    OrderRepository.createOrder({
      orderType: 'TAKEAWAY',
      items: [{ id: 'i-2', orderId: '', menuItemId: 'm-2', name: 'Dal Makhani', sku: 'DM-1', modifiers: [], quantity: 1, unitPrice: 500, totalPrice: 500, kitchenStatus: 'SERVED' }],
      totalAmount: 500,
      paymentMethod: 'UPI',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED'
    });

    const active2 = ShiftRepository.getActiveShift()!;
    expect(active2.totalUpiSales).toBe(500);
    expect(active2.totalSales).toBe(1000);
    expect(active2.expectedCash).toBe(2500); // UPI does not affect drawer cash

    // Test 4: Create ₹1,000 Split order
    OrderRepository.createOrder({
      orderType: 'DINE_IN',
      items: [{ id: 'i-3', orderId: '', menuItemId: 'm-3', name: 'Thali Combo', sku: 'TH-1', modifiers: [], quantity: 2, unitPrice: 500, totalPrice: 1000, kitchenStatus: 'SERVED' }],
      totalAmount: 1000,
      paymentMethod: 'SPLIT',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED'
    });

    const active3 = ShiftRepository.getActiveShift()!;
    expect(active3.totalSales).toBe(2000); // 500 + 500 + 1000
    expect(active3.totalOrders).toBe(3);
  });

  it('3. should record cash movements (Cash In, Cash Out) and update drawer math correctly', () => {
    const shift = ShiftRepository.openShift('usr-cashier-1', 'Amit Dave', 2000, 'POS-01');

    // Cash in ₹500
    ShiftRepository.addCashMovement(shift.id, 'CASH_IN', 500, 'Bank change float added', 'Amit Dave');
    expect(shift.expectedCash).toBe(2500);

    // Cash out ₹200
    ShiftRepository.addCashMovement(shift.id, 'CASH_OUT', 200, 'Petty cash dairy expense', 'Amit Dave');
    expect(shift.expectedCash).toBe(2300);

    const movements = ShiftRepository.getCashMovements(shift.id);
    expect(movements.length).toBe(2);
  });

  it('4. should close shift with denomination counting and calculate cash variance accurately', () => {
    const shift = ShiftRepository.openShift('usr-cashier-1', 'Amit Dave', 2000, 'POS-01');
    shift.totalCashSales = 1000;
    shift.expectedCash = 3000;

    // Actual cash counted in drawer is ₹2,950 (₹50 shortage)
    const closed = ShiftRepository.closeShift(shift.id, 2950, '₹50 coin shortage in change');

    expect(closed).not.toBeNull();
    expect(closed?.status).toBe('CLOSED');
    expect(closed?.actualCash).toBe(2950);
    expect(closed?.closingCash).toBe(2950);
    expect(closed?.cashVariance).toBe(-50);
    expect(closed?.closedAt).toBeDefined();

    // Verify audit trail
    const audit = db.auditLogs.find((a) => a.action === 'SHIFT_CLOSE');
    expect(audit).toBeDefined();
    expect(audit?.details).toContain('Variance ₹-50');

    // Verify active shift is now undefined
    expect(ShiftRepository.getActiveShift()).toBeUndefined();
  });

  it('5. should preserve closed shifts in permanent shift history archive', () => {
    // Open and close Shift 1
    const shift1 = ShiftRepository.openShift('usr-1', 'Amit Dave', 1000, 'POS-01');
    ShiftRepository.closeShift(shift1.id, 1000);

    // Open and close Shift 2
    const shift2 = ShiftRepository.openShift('usr-2', 'Rahul Joshi', 2000, 'POS-01');
    ShiftRepository.closeShift(shift2.id, 2050, '₹50 excess change');

    const all = ShiftRepository.getAllShifts();
    expect(all.length).toBe(2);
    expect(all[0].id).toBe(shift2.id);
    expect(all[1].id).toBe(shift1.id);
    expect(all[0].status).toBe('CLOSED');
  });
});
