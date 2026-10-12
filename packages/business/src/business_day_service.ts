import { BusinessDay, BusinessDayPreCloseCheck, ShiftRecord } from '@jamanvaar/types';
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
  newShift?: ShiftRecord;
  reconciled: boolean;
  warnings: string[];
}

export class BusinessDayService {
  public static shiftBelongsToDay(shift: ShiftRecord, day: BusinessDay): boolean {
    return shift.businessDayId ? shift.businessDayId === day.id : BusinessDayRepository.getCanonicalBusinessDate(new Date(shift.openedAt)).dateKey === day.businessDate;
  }

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

    const orderIds = new Set(orders.map(o => o.id));
    const pendingKots = db.kots.filter(k => (orderIds.has(k.orderId) || (!db.orders.some(o => o.id === k.orderId) && BusinessDayRepository.getCanonicalBusinessDate(new Date(k.createdAt)).dateKey === day.businessDate)) && k.status !== 'SERVED' && k.status !== 'CANCELLED');

    const unclosedShifts = db.shifts.filter(
      s => s.status === 'OPEN' && this.shiftBelongsToDay(s, day)
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
   * 7. Registers remain closed until their cashier counts and opens a shift
   * 8. Broadcast BUSINESS_DAY_CLOSED and BUSINESS_DAY_STARTED
   * 9. Dispatch role-specific AppNotifications
   */
  public static closeBusinessDay(options: CloseBusinessDayOptions = {}): CloseBusinessDayResult {
    return db.transaction(() => this.finalizeBusinessDay(options));
  }

  private static finalizeBusinessDay(options: CloseBusinessDayOptions): CloseBusinessDayResult {
    const dayId = options.businessDayId || this.getActiveBusinessDay().id;
    const closedBy = options.closedBy || 'Staff';

    // Pre-close validation
    const check = this.validatePreClose(dayId);
    if (check.day.status === 'CLOSED') throw new Error('This business day is already closed.');
    const dayShifts = db.shifts.filter(s => this.shiftBelongsToDay(s, check.day));
    const openShifts = dayShifts.filter(s => s.status === 'OPEN');
    // Branch cash is an aggregate. Once more than one shift participated, it
    // cannot be used as the counted cash of the last remaining open register.
    const spansBusinessDates = openShifts.some(shift => ShiftRepository.getShiftOrders(shift).some(order => !BusinessDayRepository.orderBelongsToBusinessDay(order, check.day)));
    if (openShifts.length > 1 || (openShifts.length > 0 && dayShifts.length > 1) || spansBusinessDates) {
      throw new Error('Count and close each register shift before closing the branch business day.');
    }
    if (!check.isReadyToClose && !options.forceCloseWithExceptions) {
      throw new Error(`Cannot close business day: ${check.warnings.join(' ')}`);
    }

    const expectedCash = check.expectedCash;
    if (options.actualCash === undefined) throw new Error('Count the cash before closing the business day, including zero for an empty drawer.');
    const actualCash = options.actualCash;
    if (!Number.isFinite(actualCash) || actualCash < 0) throw new Error('Enter a valid counted cash amount.');
    const variance = actualCash - expectedCash;
    if (Math.abs(variance) >= 0.005 && !options.varianceReason?.trim()) throw new Error('Explain the cash discrepancy before closing the business day.');
    const varianceReason = options.varianceReason?.trim() || 'Drawer Balanced';

    // 1. Close current business day
    const closedDay = BusinessDayRepository.closeBusinessDay(
      dayId,
      actualCash,
      closedBy,
      varianceReason
    );

    // 2. Close active shifts for this day
    const activeShifts = openShifts;
    activeShifts.forEach((s) => {
      ShiftRepository.closeShift(s.id, actualCash, `Closed during EOD by ${closedBy}`);
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
GST TAX: Rs. ${closedDay.tax}
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

    const alreadyActive = db.businessDays.find(d => d.id !== dayId && ['OPEN', 'REOPENED'].includes(d.status) && d.businessDate >= nextDateKey);
    const newDay = alreadyActive ?? BusinessDayRepository.openNewBusinessDay(closedBy, 0, nextDateKey);

    // 6. Clean operational served tickets for fresh day start
    const closedOrderIds = new Set(BusinessDayRepository.getOrdersForBusinessDay(dayId).map(o => o.id));
    db.kots = db.kots.filter(k => !closedOrderIds.has(k.orderId) || (k.status !== 'SERVED' && k.status !== 'CANCELLED'));

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

    if (!alreadyActive) lanMeshSync.broadcast('BUSINESS_DAY_STARTED', {
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
      message: `${closedDay.displayDate} closed with ₹${closedDay.netSales} net sales across ${closedDay.orderCount} orders. Active business day: ${newDay.displayDate}.`,
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
      reconciled: closedDay.cashVariance === 0,
      warnings: check.warnings
    };
  }

  /**
   * Recover the day and an existing register shift; never invent counted money or a cashier.
   */
  public static recoverBusinessDayState(): {
    activeDay: BusinessDay;
    activeShift?: ShiftRecord;
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

    const activeShift = ShiftRepository.getActiveShift();

    if (recovered) {
      AuditRepository.log({
        action: 'STATE_RECOVERED',
        category: 'SYSTEM',
        details: `BusinessDayService recovered active day ${activeDay.id} (${activeDay.displayDate}); ${activeShift ? `existing shift ${activeShift.id}` : 'register awaiting cashier opening'}`,
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
    // Pure read: do NOT trigger the operational date rollover here
    // while detecting an outstanding prior day — this check must detect rollover without closing.
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
