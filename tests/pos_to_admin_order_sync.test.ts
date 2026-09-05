import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db, OrderRepository } from '@jamanvaar/database';
import { lanMeshSync } from '@jamanvaar/sync';
import { usePosStore } from '../apps/restaurant-system/pos/src/store/posStore';
import { ReportGeneratorService } from '@jamanvaar/business';

describe('JAMANVAAR POS ➔ POS ADMIN Real-Time Order & Sales Reflection', () => {
  beforeEach(() => {
    // Freeze "now" so the active business day (and its 'TODAY' report scope) can't shift
    // mid-test from a real-clock 5:00 AM cutoff crossing or day-boundary drift in seed data.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T08:30:00.000Z'));

    db.resetToDefaultSeed();
    usePosStore.getState().clearCart();
    lanMeshSync.registerDevice('POS_ADMIN', 'ADMIN-01', 'Restaurant Admin HQ');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. should immediately reflect an order created and settled on POS in POS Admin database and reports', async () => {
    const initialOrdersCount = db.orders.length;
    const initialTodayReport = ReportGeneratorService.getReportForPeriod('TODAY');
    const initialSales = initialTodayReport.summary.netSales;

    // 1. Add items on POS
    const dish = db.menuItems[0];
    usePosStore.getState().addItemToCart(dish, [], '', 2);

    const payable = usePosStore.getState().cart.totalPayable;
    expect(payable).toBeGreaterThan(0);

    // 2. Settle on POS via Instant Bill
    const settledOrder = await usePosStore.getState().executeInstantBill('CASH');
    expect(settledOrder).toBeDefined();

    // 3. Verify that POS Admin orders collection has the new order
    expect(db.orders.length).toBe(initialOrdersCount + 1);
    const found = db.orders.find((o) => o.id === settledOrder?.id);
    expect(found).toBeDefined();
    expect(found?.orderNumber).toBe(settledOrder?.orderNumber);
    expect(found?.paymentStatus).toBe('SUCCESS');
    expect(found?.orderStatus).toBe('COMPLETED');
    expect(found?.totalAmount).toBe(payable);

    // 4. Verify POS Admin Today's sales KPI immediately increased
    const updatedTodayReport = ReportGeneratorService.getReportForPeriod('TODAY');
    expect(updatedTodayReport.summary.netSales).toBe(initialSales + payable);
    expect(updatedTodayReport.summary.ordersCount).toBe(initialTodayReport.summary.ordersCount + 1);
  });

  it('2. should immediately reflect a normal billing order (Send KOT ➔ Settle) in POS Admin', () => {
    const initialOrdersCount = db.orders.length;
    const dish = db.menuItems[1];
    usePosStore.getState().addItemToCart(dish, [], '', 1);

    const payable = usePosStore.getState().cart.totalPayable;

    // Settle via completePayment
    const settled = usePosStore.getState().completePayment('UPI_QR', payable);
    expect(settled).toBeDefined();

    // Order must be in db.orders and reflected in Admin
    expect(db.orders.length).toBe(initialOrdersCount + 1);
    const adminOrder = db.orders.find((o) => o.id === settled?.id);
    expect(adminOrder).toBeDefined();
    expect(adminOrder?.paymentMethod).toBe('UPI_QR');
  });
});
