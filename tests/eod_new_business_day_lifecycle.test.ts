import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  BusinessDayRepository,
  OrderRepository,
  ShiftRepository,
  NotificationRepository
} from '@jamanvaar/database';
import {
  BusinessDayService
} from '@jamanvaar/business';
import { lanMeshSync } from '@jamanvaar/sync';

describe('JAMANVAAR POS — End-of-Day → New Business Day → Notification Comprehensive Matrix', () => {
  beforeEach(() => {
    // Reset database to deterministic starting state for test
    db.businessDays = [
      {
        id: 'BD-20260831',
        businessDate: '2026-08-31',
        displayDate: '31 August 2026',
        openedAt: '2026-08-31T08:00:00.000Z',
        openedBy: 'Amit Dave (Lead Cashier)',
        status: 'OPEN',
        openingCash: 2000,
        cashIn: 500,
        cashOut: 300,
        grossSales: 61200,
        discounts: 900,
        netSales: 59583,
        tax: 2836,
        totalCollected: 59583,
        cashSales: 20011,
        upiSales: 27937,
        cardSales: 11435,
        otherPayments: 0,
        orderCount: 83,
        completedOrderCount: 83,
        cancelledOrderCount: 0,
        refundedOrderCount: 0,
        dineInCount: 50,
        takeawayCount: 25,
        deliveryCount: 8,
        tokenCount: 83,
        terminalId: 'POS-01',
        createdAt: '2026-08-31T08:00:00.000Z',
        updatedAt: '2026-08-31T08:00:00.000Z'
      }
    ];

    db.shifts = [
      {
        id: 'shift-20260831-01',
        posId: 'POS-01',
        cashierId: 'usr-cashier-1',
        cashierName: 'Amit Dave (Lead Cashier)',
        openedAt: '2026-08-31T08:00:00.000Z',
        status: 'OPEN',
        openingCash: 2000,
        expectedCash: 22211,
        totalCashSales: 20011,
        totalUpiSales: 27937,
        totalCardSales: 11435,
        totalSales: 59583,
        totalDiscounts: 900,
        totalOrders: 83,
        notes: 'Day shift'
      }
    ];

    db.notifications = [];
    db.kots = [];
  });

  // TEST 1: Normal EOD
  it('TEST 1: should execute normal EOD transition atomically from 31 Aug to 01 Sep', () => {
    const activeBefore = BusinessDayService.getActiveBusinessDay();
    expect(activeBefore.id).toBe('BD-20260831');
    expect(activeBefore.status).toBe('OPEN');

    const check = BusinessDayService.validatePreClose(activeBefore.id);

    const result = BusinessDayService.closeBusinessDay({
      businessDayId: activeBefore.id,
      actualCash: check.expectedCash,
      closedBy: 'Amit Dave (Lead Cashier)'
    });

    expect(result.closedDay.status).toBe('CLOSED');
    expect(result.closedDay.businessDate).toBe('2026-08-31');
    expect(result.closedDay.closedBy).toBe('Amit Dave (Lead Cashier)');
    expect(result.closedDay.cashVariance).toBe(0);

    // New Business Day is activated
    expect(result.newDay.status).toBe('OPEN');
    expect(result.newDay.businessDate).toBe('2026-09-01');
    expect(result.newDay.id).toBe('BD-20260901');
    expect(result.newDay.openingCash).toBe(2000);

    // Active Day query now returns the new day
    const activeAfter = BusinessDayService.getActiveBusinessDay();
    expect(activeAfter.id).toBe('BD-20260901');
    expect(activeAfter.status).toBe('OPEN');
  });

  // TEST 2: EOD with Open Orders Block
  it('TEST 2: should block EOD when active in-progress orders exist unless forced', () => {
    // Add open order
    OrderRepository.createOrder({
      id: 'ord-open-1',
      orderNumber: 'ORD-999',
      orderStatus: 'PREPARING',
      paymentStatus: 'PENDING',
      totalAmount: 450,
      businessDayId: 'BD-20260831'
    });

    const check = BusinessDayService.validatePreClose('BD-20260831');
    expect(check.isReadyToClose).toBe(false);
    expect(check.activeOrdersCount).toBeGreaterThan(0);
    expect(check.warnings.length).toBeGreaterThan(0);

    // Attempting close without force throws error
    expect(() => {
      BusinessDayService.closeBusinessDay({ businessDayId: 'BD-20260831', forceCloseWithExceptions: false });
    }).toThrow(/Cannot close business day/);

    // Forced close succeeds
    const result = BusinessDayService.closeBusinessDay({ businessDayId: 'BD-20260831', forceCloseWithExceptions: true });
    expect(result.closedDay.status).toBe('CLOSED');
  });

  // TEST 3: EOD with Pending KOT Block
  it('TEST 3: should report warning when unserved kitchen KOT tickets exist', () => {
    db.kots.push({
      id: 'kot-test-1',
      kotNumber: 'KOT-99',
      orderId: 'ord-101',
      orderNumber: 'ORD-101',
      tokenNumber: '101',
      cashierName: 'Amit Dave',
      printed: true,
      orderType: 'DINE_IN',
      station: 'Main Kitchen',
      type: 'FIRST',
      items: [],
      status: 'PREPARING',
      createdAt: new Date().toISOString()
    });

    const check = BusinessDayService.validatePreClose('BD-20260831');
    expect(check.pendingKotCount).toBe(1);
    expect(check.isReadyToClose).toBe(false);
  });

  // TEST 4: EOD with Pending Payment
  it('TEST 4: should identify unpaid bills in pre-close check', () => {
    OrderRepository.createOrder({
      id: 'ord-unpaid-1',
      orderNumber: 'ORD-888',
      orderStatus: 'CONFIRMED',
      paymentStatus: 'PENDING',
      totalAmount: 600,
      businessDayId: 'BD-20260831'
    });

    const check = BusinessDayService.validatePreClose('BD-20260831');
    expect(check.unpaidOrdersCount).toBeGreaterThan(0);
  });

  // TEST 5: EOD with Refund Accounting
  it('TEST 5: should properly tally refunds in business day metrics and snapshot', () => {
    OrderRepository.createOrder({
      id: 'ord-ref-1',
      orderNumber: 'ORD-REF-1',
      orderStatus: 'REFUNDED',
      paymentStatus: 'REFUNDED',
      totalAmount: 500,
      businessDayId: 'BD-20260831'
    });

    BusinessDayRepository.recalculateMetrics('BD-20260831');
    const day = BusinessDayRepository.getBusinessDayById('BD-20260831')!;
    expect(day.refundedOrderCount).toBe(1);
  });

  // TEST 6: EOD with Cash Variance
  it('TEST 6: should record cash overage/shortage variance with reason during EOD', () => {
    const check = BusinessDayService.validatePreClose('BD-20260831');
    const result = BusinessDayService.closeBusinessDay({
      businessDayId: 'BD-20260831',
      actualCash: check.expectedCash - 211, // Shortage of ₹211
      varianceReason: 'Shortage due to change discrepancy',
      forceCloseWithExceptions: true
    });

    expect(result.closedDay.cashVariance).toBe(-211);
    expect(result.closedDay.varianceReason).toBe('Shortage due to change discrepancy');
    expect(result.reconciled).toBe(false);
  });

  // TEST 7: Double-Click EOD Idempotency
  it('TEST 7: should prevent double-EOD from creating multiple duplicate new days', () => {
    BusinessDayService.closeBusinessDay({ businessDayId: 'BD-20260831', forceCloseWithExceptions: true });

    // Second click on open new day should return already open active day
    const secondCall = BusinessDayRepository.openNewBusinessDay('Amit Dave', 2000, '2026-09-01');
    expect(secondCall.id).toBe('BD-20260901');

    const openDays = db.businessDays.filter((d) => d.status === 'OPEN');
    expect(openDays.length).toBe(1);
  });

  // TEST 8: POS creates new order after EOD
  it('TEST 8: new order created after EOD must strictly bind to new businessDayId and start token at #101', () => {
    BusinessDayService.closeBusinessDay({ businessDayId: 'BD-20260831', forceCloseWithExceptions: true });
    const activeDay = BusinessDayService.getActiveBusinessDay();
    expect(activeDay.id).toBe('BD-20260901');

    // Create fresh order on new day
    const newOrder = OrderRepository.createOrder({
      subtotal: 500,
      totalAmount: 525,
      orderType: 'DINE_IN',
      source_type: 'POS'
    });

    expect(newOrder.businessDayId).toBe('BD-20260901');
    expect(newOrder.tokenNumber).toBe('101'); // Reset to first token of the day!

    // Place second order
    const nextOrder = OrderRepository.createOrder({
      subtotal: 300,
      totalAmount: 315,
      orderType: 'TAKEAWAY',
      source_type: 'POS'
    });

    expect(nextOrder.businessDayId).toBe('BD-20260901');
    expect(nextOrder.tokenNumber).toBe('102');
  });

  // TEST 9: Daily Counters Reset on New Day
  it('TEST 9: should reset new business day counters to zero while preserving historical reports', () => {
    BusinessDayService.closeBusinessDay({ businessDayId: 'BD-20260831', forceCloseWithExceptions: true });
    const newDay = BusinessDayService.getActiveBusinessDay();

    expect(newDay.grossSales).toBe(0);
    expect(newDay.netSales).toBe(0);
    expect(newDay.orderCount).toBe(0);
    expect(newDay.completedOrderCount).toBe(0);

    // Old day retains all historical figures
    const oldDay = BusinessDayRepository.getBusinessDayById('BD-20260831')!;
    expect(oldDay.netSales).toBeGreaterThan(0);
    expect(oldDay.orderCount).toBeGreaterThan(0);
  });

  // TEST 10: Notification System Dispatch & Badges
  it('TEST 10: should generate persistent AppNotifications with unread count updates upon EOD', () => {
    BusinessDayService.closeBusinessDay({ businessDayId: 'BD-20260831', forceCloseWithExceptions: true });

    const posNotifs = NotificationRepository.getNotifications('POS');
    expect(posNotifs.length).toBeGreaterThanOrEqual(2);

    const closedNotif = posNotifs.find((n) => n.type === 'BUSINESS_DAY_CLOSED');
    const startedNotif = posNotifs.find((n) => n.type === 'BUSINESS_DAY_STARTED');

    expect(closedNotif).toBeDefined();
    expect(startedNotif).toBeDefined();

    // Check unread count
    const unreadCount = NotificationRepository.getUnreadCount('POS');
    expect(unreadCount).toBeGreaterThanOrEqual(2);

    // Mark one as read
    NotificationRepository.markAsRead(closedNotif!.id);
    expect(NotificationRepository.getUnreadCount('POS')).toBe(unreadCount - 1);
  });

  // TEST 11: Startup State Recovery
  it('TEST 11: should safely recover active day and open shift on app restart', () => {
    // Simulate empty active day in memory
    db.businessDays = db.businessDays.map((d) => ({ ...d, status: 'CLOSED' as const }));
    db.shifts = [];

    const recovery = BusinessDayService.recoverBusinessDayState();
    expect(recovery.recovered).toBe(true);
    expect(recovery.activeDay.status).toBe('OPEN');
    expect(recovery.activeShift.status).toBe('OPEN');
  });

  // TEST 12: Midnight Calendar Rollover Guard
  it('TEST 12: should detect calendar date crossing without auto-closing active business day', () => {
    const activeDay = BusinessDayService.getActiveBusinessDay();
    // Simulate active day with yesterday date string
    activeDay.businessDate = '2026-08-30';

    const check = BusinessDayService.checkCalendarDateChange();
    expect(check.hasDateRolledOver).toBe(true);
    expect(check.activeDay.status).toBe('OPEN'); // Remains open until explicit cashier EOD
  });
});
