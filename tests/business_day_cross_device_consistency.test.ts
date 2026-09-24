import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db, BusinessDayRepository, BusinessDayAccountingService, OrderRepository } from '../packages/database/src';
import { getRestaurantHour } from '../packages/utils/src';

/**
 * B2-017: one paid order showed ₹410 on POS but ₹0 on Restaurant Admin's Dashboard/Billing/
 * Payments — because two independent bugs compounded:
 *
 * 1. `BusinessDayRepository.getCanonicalBusinessDate()` (which decides the 5 AM cutoff and which
 *    calendar day an order belongs to) read `date.getHours()`/`getDate()`/`getMonth()` — the
 *    *device's own* system clock/timezone, not the restaurant's (Asia/Kolkata). Two devices with
 *    different OS timezone settings computed different business-day ids for the same real-world
 *    moment.
 * 2. `BusinessDayAccountingService.getActiveBusinessDay()` — the function Restaurant Admin's
 *    Dashboard/Billing/Payments actually call — had its own separate, simpler logic with no 5 AM
 *    cutoff check at all: it just returned whatever was already marked OPEN in *this device's own*
 *    local store. A device that never creates an order itself (Restaurant Admin doesn't call
 *    `OrderRepository.createOrder()`) never triggered a rollover on its own — only an
 *    order-creating device (POS, via `BusinessDayRepository.getActiveBusinessDay()`) ever advanced
 *    past the cutoff. So Restaurant Admin's own local "today" could get stuck on yesterday forever
 *    once POS had already rolled over, and any order stamped with POS's newer business-day id
 *    would silently fail Restaurant Admin's own "is this today's order" check.
 */
describe('Business day is computed consistently everywhere (B2-017)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getRestaurantHour is timezone-independent', () => {
    it('reads the hour in Asia/Kolkata, not whatever the process/device clock is set to', () => {
      // 2026-09-20T19:30:00.000Z = 2026-09-21T01:00:00+05:30 IST — hour 1 in IST, hour 19 in UTC.
      // A device running with its system clock in UTC (or any other zone) must still see hour 1.
      expect(getRestaurantHour('2026-09-20T19:30:00.000Z')).toBe(1);
      // 2026-09-20T10:00:00.000Z = 2026-09-20T15:30:00+05:30 IST — hour 15.
      expect(getRestaurantHour('2026-09-20T10:00:00.000Z')).toBe(15);
    });
  });

  describe('getCanonicalBusinessDate applies the 5 AM cutoff in the restaurant\'s own timezone', () => {
    it('a 00:52 IST order belongs to the previous business day, regardless of the device\'s own timezone', () => {
      // 2026-09-20T19:22:00.000Z = 2026-09-21T00:52:00+05:30 IST — the exact scenario from the bug report.
      const canonical = BusinessDayRepository.getCanonicalBusinessDate(new Date('2026-09-20T19:22:00.000Z'));
      expect(canonical.dateKey).toBe('2026-09-20');
      expect(canonical.dayId).toBe('BD-20260920');
    });

    it('an order at 06:00 IST belongs to that same calendar day (past the cutoff)', () => {
      // 2026-09-21T00:30:00.000Z = 2026-09-21T06:00:00+05:30 IST.
      const canonical = BusinessDayRepository.getCanonicalBusinessDate(new Date('2026-09-21T00:30:00.000Z'));
      expect(canonical.dateKey).toBe('2026-09-21');
      expect(canonical.dayId).toBe('BD-20260921');
    });
  });

  describe('order creation and reporting agree on "today" even on a device that never creates an order', () => {
    beforeEach(() => {
      db.resetToDefaultSeed();
    });

    it('BusinessDayAccountingService (Dashboard/Billing/Payments) rolls over on its own, without needing OrderRepository.createOrder() to trigger it first', () => {
      // Start the seeded day, then jump real time forward past the 5 AM cutoff into a new
      // calendar day — simulating Restaurant Admin sitting idle overnight with no order ever
      // created on this device.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-31T08:30:00.000Z')); // matches the suite's other seeded-day tests
      const seededDay = BusinessDayAccountingService.getActiveBusinessDay();
      expect(seededDay.businessDate).toBe('2026-08-31');

      // Jump to 2026-09-02T01:00:00Z = 2026-09-02T06:30:00+05:30 IST — well past the cutoff, two days later.
      vi.setSystemTime(new Date('2026-09-02T01:00:00.000Z'));

      // A read-only device (Restaurant Admin) queries only via BusinessDayAccountingService —
      // this alone must roll the day over; before the fix it never would have.
      const rolledDay = BusinessDayAccountingService.getActiveBusinessDay();
      expect(rolledDay.businessDate).toBe('2026-09-02');
      expect(rolledDay.id).not.toBe(seededDay.id);
    });

    it("an order POS creates today is recognized as today's by the same active-day id Restaurant Admin's reporting reads", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-31T08:30:00.000Z'));

      // POS creates an order via the real order-creation path.
      const order = OrderRepository.createOrder({
        subtotal: 100,
        discountAmount: 0,
        totalAmount: 100,
        orderType: 'DINE_IN',
        paymentMethod: 'CASH',
        paymentStatus: 'SUCCESS',
        source_type: 'POS'
      } as never);

      // Restaurant Admin's reporting path (BusinessDayAccountingService) must agree this order
      // belongs to the currently active day.
      const reportingActiveDay = BusinessDayAccountingService.getActiveBusinessDay();
      expect(order.businessDayId).toBe(reportingActiveDay.id);
    });
  });
});
