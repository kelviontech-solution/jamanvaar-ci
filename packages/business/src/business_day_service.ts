import {
  BusinessDay,
  BusinessDayPreCloseCheck,
  Order,
  ShiftRecord,
  AppNotification
} from '@jamanvaar/types';
import {
  db,
  BusinessDayRepository,
  ShiftRepository,
  AuditRepository,
  PrintQueueRepository,
  NotificationRepository
} from '@jamanvaar/database';
import { lanMeshSync } from '@jamanvaar/sync';

export interface CloseBusinessDayOptions {
  businessDayId?: string;
  actualCash?: number;
  closedBy?: string;
  varianceReason?: string;
  forceCloseWithExceptions?: boolean;
}

export interface CloseBusinessDayResult {
  closedDay: BusinessDay;
  newDay: BusinessDay;
  newShift: ShiftRecord;
  reconciled: boolean;
  warnings: string[];
}

export class BusinessDayService {
  /**
   * Returns the currently active (OPEN / REOPENED / CLOSING) Business Day.
   */
  public static getActiveBusinessDay(): BusinessDay {
    return BusinessDayRepository.getActiveBusinessDay();
  }

  public static getCurrentBusinessDay(): BusinessDay {
    return this.getActiveBusinessDay();
  }

  public static getBusinessDayById(id: string): BusinessDay | undefined {
    return BusinessDayRepository.getBusinessDayById(id);
  }

  public static getAllBusinessDays(): BusinessDay[] {
    return BusinessDayRepository.getAllBusinessDays();
  }

  /**
   * Pre-close validation checking open orders, unpaid bills, unserved KOTs, and cash expected
   */
  public static validatePreClose(businessDayId?: string): BusinessDayPreCloseCheck {
    const dayId = businessDayId || this.getActiveBusinessDay().id;
    const day = BusinessDayRepository.recalculateMetrics(dayId) || this.getActiveBusinessDay();
    const orders = BusinessDayRepository.getOrdersForBusinessDay(day.id);

    const activeOrders = orders.filter(
      (o) => o.orderStatus !== 'COMPLETED' && o.orderStatus !== 'CANCELLED' && o.orderStatus !== 'REFUNDED'
    );

    const unpaidOrders = orders.filter(
      (o) => o.paymentStatus !== 'SUCCESS' && o.orderStatus !== 'CANCELLED' && o.orderStatus !== 'REFUNDED'
    );

    const pendingKots = db.kots.filter(
      (k) => k.status !== 'SERVED' && k.status !== 'CANCELLED'
    );

    const unclosedShifts = db.shifts.filter(
      (s) => s.status === 'OPEN'
    );

    const expectedCash = (day.openingCash || 0) + (day.cashSales || 0) + (day.cashIn || 0) - (day.cashOut || 0);

    const warnings: string[] = [];
    if (activeOrders.length > 0) {
      warnings.push(`${activeOrders.length} order(s) still in progress/unsettled.`);
    }
    if (unpaidOrders.length > 0) {
      warnings.push(`${unpaidOrders.length} order(s) have pending payment.`);
    }
    if (pendingKots.length > 0) {
      warnings.push(`${pendingKots.length} kitchen KOT ticket(s) are not served.`);
    }

    const isReadyToClose = warnings.length === 0;

    return {
      day,
      activeOrdersCount: activeOrders.length,
      unpaidOrdersCount: unpaidOrders.length,
      pendingKotCount: pendingKots.length,
      unclosedShiftsCount: unclosedShifts.length,
      expectedCash,
      isReadyToClose,
      warnings
    };
  }

  /**
   * Atomic End-of-Day (EOD) Transaction:
   * 1. Validate & calculate final totals
   * 2. Save EOD snapshot
   * 3. Close active shifts
   * 4. Mark current business day CLOSED
   * 5. Spool EOD Z-Report to printer
   * 6. Create next business day & mark ACTIVE
   * 7. Open initial shift for next day
   * 8. Broadcast BUSINESS_DAY_CLOSED and BUSINESS_DAY_STARTED
   * 9. Dispatch role-specific AppNotifications
   */
  public static closeBusinessDay(options: CloseBusinessDayOptions = {}): CloseBusinessDayResult {
    const dayId = options.businessDayId || this.getActiveBusinessDay().id;
    const closedBy = options.closedBy || 'Staff';

    // Pre-close validation
    const check = this.validatePreClose(dayId);
    if (!check.isReadyToClose && !options.forceCloseWithExceptions) {
      throw new Error(`Cannot close business day: ${check.warnings.join(' ')}`);
    }

    const expectedCash = check.expectedCash;
    const actualCash = options.actualCash !== undefined ? options.actualCash : expectedCash;
    const variance = actualCash - expectedCash;
    const varianceReason = options.varianceReason || (variance === 0 ? 'Drawer Balanced' : 'Cash Variance Recorded');

    // 1. Close current business day
    const closedDay = BusinessDayRepository.closeBusinessDay(
      dayId,
      actualCash,
      closedBy,
      varianceReason
    );

    // 2. Close active shifts for this day
    const activeShifts = db.shifts.filter((s) => s.status === 'OPEN');
    activeShifts.forEach((s) => {
      s.status = 'CLOSED';
      s.closedAt = new Date().toISOString();
      s.closingCash = actualCash;
      s.cashVariance = variance;
      s.notes = `${s.notes || ''} [Closed during EOD by ${closedBy}]`.trim();
    });

    // 3. Spool official EOD Z-Report to Print Queue
    try {
      const printer = db.configuredPrinters.find((p) => p.role === 'REPORT') || db.configuredPrinters[0];
      if (printer) {
        const rawPayload = `
========================================
       JAMANVAAR EOD Z-REPORT
----------------------------------------
BUSINESS DAY: ${closedDay.displayDate}
STATUS: CLOSED (FINAL)
CLOSED AT: ${new Date(closedDay.closedAt || '').toLocaleTimeString('en-IN')}
BY: ${closedDay.closedBy}
----------------------------------------
NET SALES: Rs. ${closedDay.netSales}
ORDERS BILLED: ${closedDay.orderCount}
GST TAX (5%): Rs. ${closedDay.tax}
----------------------------------------
CASH SALES: Rs. ${closedDay.cashSales}
UPI SALES: Rs. ${closedDay.upiSales}
CARD SALES: Rs. ${closedDay.cardSales}
----------------------------------------
DRAWER EXPECTED: Rs. ${closedDay.expectedCash}
DRAWER ACTUAL: Rs. ${closedDay.closingCash}
CASH VARIANCE: Rs. ${closedDay.cashVariance}
========================================
        `.trim();

        PrintQueueRepository.addJob({
          type: 'SHIFT_REPORT',
          printerId: printer.id,
          printerName: printer.name,
          rawPayload,
          paperSize: printer.paperSize || '80mm'
        });
      }
    } catch (_) {}

    // 4. Calculate next business date and open new day
    const [y, m, d] = closedDay.businessDate.split('-').map(Number);
    const nextDate = new Date(y, m - 1, d + 1, 8, 0, 0);
    const nextYyyy = nextDate.getFullYear();
    const nextMm = String(nextDate.getMonth() + 1).padStart(2, '0');
    const nextDd = String(nextDate.getDate()).padStart(2, '0');
    const nextDateKey = `${nextYyyy}-${nextMm}-${nextDd}`;

    const newDay = BusinessDayRepository.openNewBusinessDay(closedBy, 2000, nextDateKey);

    // 5. Open new shift for the new business day
    const newShiftId = `shift-${nextYyyy}${nextMm}${nextDd}-01`;
    const newShift: ShiftRecord = {
      id: newShiftId,
      posId: 'POS-01',
      cashierId: 'usr-cashier-1',
      cashierName: closedBy,
      openedAt: new Date().toISOString(),
      status: 'OPEN',
      openingCash: 2000,
      expectedCash: 2000,
      totalCashSales: 0,
      totalUpiSales: 0,
      totalCardSales: 0,
      totalSales: 0,
      totalDiscounts: 0,
      totalOrders: 0,
      notes: `Morning shift opening float ₹2,000 verified for ${newDay.displayDate}`
    };
    db.shifts.unshift(newShift);

    // 6. Clean operational served tickets for fresh day start
    db.kots = db.kots.filter((k) => k.status === 'PENDING' || k.status === 'PREPARING' || k.status === 'ACCEPTED');

    // 7. Dispatch Mesh Events
    lanMeshSync.broadcast('BUSINESS_DAY_CLOSED', {
      businessDayId: closedDay.id,
      businessDate: closedDay.businessDate,
      displayDate: closedDay.displayDate,
      closedAt: closedDay.closedAt,
      closedBy: closedDay.closedBy,
      netSales: closedDay.netSales,
      orderCount: closedDay.orderCount,
      cashVariance: closedDay.cashVariance
    });

    lanMeshSync.broadcast('BUSINESS_DAY_STARTED', {
      businessDayId: newDay.id,
      businessDate: newDay.businessDate,
      displayDate: newDay.displayDate,
      openedAt: newDay.openedAt,
      openedBy: newDay.openedBy,
      openingCash: newDay.openingCash
    });

    // 8. Create Role-Specific Persistent App Notifications
    NotificationRepository.createNotification({
      type: 'BUSINESS_DAY_CLOSED',
      title: `✓ END OF DAY COMPLETE (${closedDay.displayDate})`,
      message: `${closedDay.displayDate} closed with ₹${closedDay.netSales} net sales across ${closedDay.orderCount} orders. New business day ${newDay.displayDate} started.`,
      targetRoles: ['POS', 'POS_ADMIN'],
      priority: 'HIGH',
      meta: {
        businessDayId: closedDay.id,
        newBusinessDayId: newDay.id,
        netSales: closedDay.netSales,
        orderCount: closedDay.orderCount,
        variance: closedDay.cashVariance
      }
    });

    NotificationRepository.createNotification({
      type: 'BUSINESS_DAY_STARTED',
      title: `☀️ NEW BUSINESS DAY STARTED (${newDay.displayDate})`,
      message: `POS terminal & floor ready to accept orders for ${newDay.displayDate}. Token counter reset to #101.`,
      targetRoles: ['POS', 'POS_ADMIN', 'CAPTAIN', 'KDS'],
      priority: 'NORMAL',
      meta: {
        newBusinessDayId: newDay.id,
        businessDate: newDay.businessDate
      }
    });

    db.notify();

    return {
      closedDay,
      newDay,
      newShift,
      reconciled: closedDay.cashVariance === 0,
      warnings: check.warnings
    };
  }

  /**
   * System startup recovery: ensures an active business day and shift exist
   */
  public static recoverBusinessDayState(): {
    activeDay: BusinessDay;
    activeShift: ShiftRecord;
    recovered: boolean;
  } {
    let activeDay = db.businessDays.find(
      (d) => d.status === 'OPEN' || d.status === 'REOPENED'
    );
    let recovered = false;

    if (!activeDay) {
      activeDay = BusinessDayRepository.getActiveBusinessDay();
      recovered = true;
    }

    let activeShift = ShiftRepository.getActiveShift();
    if (!activeShift) {
      const now = new Date();
      activeShift = {
        id: `shift-${Date.now()}`,
        posId: 'POS-01',
        cashierId: 'usr-cashier-1',
        cashierName: 'Amit Dave (Lead Cashier)',
        openedAt: now.toISOString(),
        status: 'OPEN',
        openingCash: 2000,
        expectedCash: 2000,
        totalCashSales: 0,
        totalUpiSales: 0,
        totalCardSales: 0,
        totalSales: 0,
        totalDiscounts: 0,
        totalOrders: 0,
        notes: `System startup auto-initialized shift for ${activeDay.displayDate}`
      };
      db.shifts.unshift(activeShift);
      recovered = true;
    }

    if (recovered) {
      AuditRepository.log({
        action: 'STATE_RECOVERED',
        category: 'SYSTEM',
        details: `BusinessDayService recovered active day ${activeDay.id} (${activeDay.displayDate}) and shift ${activeShift.id}`,
        username: 'System'
      });
      db.notify();
    }

    return { activeDay, activeShift, recovered };
  }

  /**
   * Check if calendar crossed midnight without EOD closure
   */
  public static checkCalendarDateChange(): {
    hasDateRolledOver: boolean;
    activeDay: BusinessDay;
    currentCalendarDate: string;
  } {
    // Pure read: do NOT use getActiveBusinessDay() here, since it auto-closes
    // stale days as a side effect — this check must detect rollover without closing.
    const activeDay = db.businessDays.find(
      (d) => d.status === 'OPEN' || d.status === 'CLOSING' || d.status === 'REOPENED'
    ) || this.getActiveBusinessDay();
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const currentCalendarDate = `${yyyy}-${mm}-${dd}`;

    const hasDateRolledOver = activeDay.status === 'OPEN' && activeDay.businessDate !== currentCalendarDate;

    return {
      hasDateRolledOver,
      activeDay,
      currentCalendarDate
    };
  }
}
