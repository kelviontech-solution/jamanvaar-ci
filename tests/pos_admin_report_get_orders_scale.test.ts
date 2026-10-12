import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@jamanvaar/database';
import { ReportDataEngine, ReportDateRange } from '../apps/restaurant-system/pos-admin/src/components/reports/reportDataEngine';
import { Order } from '@jamanvaar/types';

/**
 * getOrders() always scanned the entire in-memory db.orders array, however large a restaurant's
 * full order history has grown, even for a report asking about a narrow recent window. db.orders
 * is kept newest-first everywhere it is written (db.ts's three rebuild sites re-sort descending by
 * createdAt; repositories.ts's only append is `unshift`, which is correct for a just-created order;
 * in-place updates never change position or createdAt) — getOrders() can use that to stop scanning
 * once it passes the window's start, instead of visiting the rest of the restaurant's history.
 */
describe('ReportDataEngine.getOrders() stops scanning once past the requested window (does not touch the rest of history)', () => {
  beforeEach(() => { db.orders = []; });

  const order = (id: string, createdAt: string, extra: Partial<Order> = {}): Order =>
    ({ id, createdAt, orderStatus: 'COMPLETED', paymentStatus: 'SUCCESS', orderType: 'DINE_IN', items: [], totalAmount: 100, subtotal: 100, taxAmount: 0, discountAmount: 0, ...extra } as unknown as Order);

  /** A too-old order whose orderStatus throws if ever read — proves the scan never reached it. */
  const poisonOrder = (id: string, createdAt: string): Order => {
    const o: any = order(id, createdAt);
    delete o.orderStatus;
    Object.defineProperty(o, 'orderStatus', { get() { throw new Error(`getOrders() read orderStatus on ${id}, a too-old order it should never have scanned past the window`); } });
    return o;
  };

  const range = (startDate: Date, endDate: Date): ReportDateRange => ({ startDate, endDate, preset: 'CUSTOM', label: 'test range' });

  it('returns exactly the orders inside the window, whether the array holds 3 orders or many thousands of old ones', () => {
    const windowStart = new Date('2026-06-10T00:00:00Z');
    const windowEnd = new Date('2026-06-12T00:00:00Z');

    db.orders = [
      order('too-new', '2026-06-13T00:00:00Z'), // newer than endDate — must be skipped, not stop the scan
      order('in-window-1', '2026-06-11T12:00:00Z'),
      order('in-window-2', '2026-06-11T06:00:00Z'),
      // everything below is older than windowStart; getOrders() must never read orderStatus on any of it
      poisonOrder('too-old-1', '2026-06-09T00:00:00Z'),
      ...Array.from({ length: 5000 }, (_, i) => poisonOrder(`too-old-bulk-${i}`, `2020-01-${String((i % 27) + 1).padStart(2, '0')}T00:00:00Z`))
    ];

    const result = ReportDataEngine.getOrders(range(windowStart, windowEnd));

    expect(new Set(result.map((o) => o.id))).toEqual(new Set(['in-window-1', 'in-window-2']));
  });

  it('a window with no orders yet (array is all old history) returns empty and still never reads past the break point', () => {
    db.orders = [
      poisonOrder('too-old-1', '2026-01-01T00:00:00Z'),
      poisonOrder('too-old-2', '2026-01-02T00:00:00Z')
    ];
    const result = ReportDataEngine.getOrders(range(new Date('2026-06-10T00:00:00Z'), new Date('2026-06-12T00:00:00Z')));
    expect(result).toEqual([]);
  });
});
