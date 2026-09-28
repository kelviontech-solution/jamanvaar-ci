import { describe, it, expect } from 'vitest';
import type { AttendanceRecord, KOTRecord, Order, OrderItem, Reservation, StaffShiftSchedule } from '@jamanvaar/types';
import {
  buildDailySummaryMessage, buildLabourReport, buildLossReport, buildPrepTimeReport, allocatePaise,
  groupsBySeat, groupsEqually, splitBill, amountsByMethod, tableHold, overdueReservations, whatsappShareLink
} from '@jamanvaar/business';

const day = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 28, h, m)).toISOString();
const FROM = new Date(Date.UTC(2026, 8, 28, 0, 0));
const TO = new Date(Date.UTC(2026, 8, 28, 23, 59));

function line(id: string, extra: Partial<OrderItem> = {}): OrderItem {
  return { id, orderId: 'o', menuItemId: `m-${id}`, name: `Dish ${id}`, sku: id, quantity: 1, unitPrice: 100, totalPrice: 100, modifiers: [], kitchenStatus: 'PENDING', ...extra };
}
function order(id: string, extra: Partial<Order> = {}): Order {
  return { id, orderNumber: `N-${id}`, orderStatus: 'COMPLETED', paymentStatus: 'SUCCESS', createdAt: day(9), updatedAt: day(9), discountAmount: 0, totalAmount: 100, items: [line('a')], ...extra } as unknown as Order;
}

describe('loss report: money the restaurant did not collect, and who was behind it', () => {
  it('counts a cancelled dish at what it was worth, not the zero the line drops to', () => {
    const o = order('1', { totalAmount: 100, items: [line('a'), line('b', { kitchenStatus: 'CANCELLED', unitPrice: 0, totalPrice: 0, quantity: 2, cancelledAmount: 240, cancelledBy: 'Ravi (for Sam)', cancelReason: 'Out of stock', cancelledAt: day(10) })] });
    const r = buildLossReport({ orders: [o], from: FROM, to: TO });
    expect(r.totals.cancelledDishes).toBe(240);
    expect(r.entries[0]).toMatchObject({ kind: 'DISH_CANCELLED', label: '2 x Dish b', reason: 'Out of stock', by: 'Ravi (for Sam)' });
  });

  it('does not count a bill twice: every dish cancelled one by one is not also a voided bill', () => {
    const o = order('2', { orderStatus: 'CANCELLED', totalAmount: 0, items: [line('a', { kitchenStatus: 'CANCELLED', cancelledAmount: 100, totalPrice: 0 })] });
    const r = buildLossReport({ orders: [o], from: FROM, to: TO });
    expect(r.entries.map((e) => e.kind)).toEqual(['DISH_CANCELLED']);
    expect(r.totals.all).toBe(100);
  });

  it('counts a whole voided bill at its total with the reason from the audit trail, and lists discounts and refunds apart', () => {
    const voided = order('3', { orderStatus: 'CANCELLED', totalAmount: 1500, cashierName: 'Asha' });
    const disc = order('4', { discountAmount: 50, discountReason: 'Regular guest', discountAppliedBy: 'Manager Kiran' });
    const refunded = order('5', { orderStatus: 'REFUNDED', totalAmount: 300, cashierName: 'Asha' });
    const r = buildLossReport({ orders: [voided, disc, refunded], from: FROM, to: TO, voids: new Map([['N-3', { reason: 'Wrong table', by: 'Manager Kiran' }]]) });
    expect(r.totals).toEqual({ cancelledDishes: 0, voidedOrders: 1500, discounts: 50, refunds: 300, all: 1850 });
    expect(r.entries.find((e) => e.kind === 'ORDER_VOIDED')).toMatchObject({ reason: 'Wrong table', by: 'Manager Kiran' });
    expect(r.byStaff[0]).toMatchObject({ name: 'Manager Kiran', total: 1550 });
  });

  it('leaves out events outside the period and flags what the owner should look at', () => {
    const old = order('6', { orderStatus: 'CANCELLED', totalAmount: 900, updatedAt: '2026-09-01T09:00:00.000Z' });
    const many = Array.from({ length: 6 }, (_, i) => order(`d${i}`, { discountAmount: 20, discountAppliedBy: 'Asha', discountReason: 'Friend' }));
    const other = order('x', { orderStatus: 'CANCELLED', totalAmount: 100, cashierName: 'Ravi' });
    const r = buildLossReport({ orders: [old, ...many, other], from: FROM, to: TO });
    expect(r.entries.some((e) => e.orderId === '6')).toBe(false);
    expect(r.watch.join(' ')).toMatch(/Asha gave 6 discounts/);
    expect(r.watch.join(' ')).toMatch(/1 cancellation has no reason/);
  });
});

describe('the owner\'s end-of-day message', () => {
  const losses = buildLossReport({ orders: [order('1', { orderStatus: 'CANCELLED', totalAmount: 400, cashierName: 'Asha' })], from: FROM, to: TO });
  const base = { restaurantName: 'Sharma Dhaba', dateLabel: '28 Sep', orders: 42, sales: 18250, cash: 5000, upi: 12000, card: 1250, other: 0, topDishes: [{ name: 'Paneer Tikka', quantity: 12 }], losses };

  it('says how much came in, how it was paid, and how much did not, in plain text', () => {
    const msg = buildDailySummaryMessage(base);
    expect(msg).toContain('Sharma Dhaba');
    expect(msg).toMatch(/Sales: ₹18250 from 42 orders/);
    expect(msg).toMatch(/Cash ₹5000, UPI ₹12000, Card ₹1250/);
    expect(msg).toMatch(/Money not collected: ₹400/);
    expect(msg).toContain('Paneer Tikka (12)');
  });

  it('says so when nothing was lost, and builds a WhatsApp link that needs no key', () => {
    const none = buildLossReport({ orders: [], from: FROM, to: TO });
    expect(buildDailySummaryMessage({ ...base, losses: none })).toMatch(/none today/);
    const link = whatsappShareLink('Hello world', '+91 98765-43210');
    expect(link).toBe('https://wa.me/919876543210?text=Hello%20world');
  });
});

describe('prep time report: how long each dish really takes', () => {
  const dish = (id: string, mid: string, name: string, status: string, sent?: string, ready?: string, qty = 1): OrderItem =>
    line(id, { menuItemId: mid, name, kitchenStatus: status as OrderItem['kitchenStatus'], quantity: qty, ...(sent ? { sentAt: sent } : {}), ...(ready ? { readyAt: ready } : {}) });
  const stationOf = (id: string) => (id === 'tea' ? 'Beverages Bar' : 'Main Kitchen');

  it('measures sent-to-ready per dish, ranks the slowest first, and checks it against the menu target', () => {
    const r = buildPrepTimeReport({
      from: FROM, to: TO, stationOf, targetOf: (id) => (id === 'biryani' ? 15 : undefined),
      orders: [
        order('p1', { items: [dish('a', 'biryani', 'Biryani', 'READY', day(12, 0), day(12, 20)), dish('b', 'tea', 'Tea', 'SERVED', day(12, 0), day(12, 3))] }),
        order('p2', { items: [dish('c', 'biryani', 'Biryani', 'SERVED', day(13, 0), day(13, 10))] })
      ]
    });
    expect(r.dishes.map((d) => d.name)).toEqual(['Biryani', 'Tea']);
    expect(r.dishes[0]).toMatchObject({ portions: 2, avgMinutes: 15, slowestMinutes: 20, targetMinutes: 15, onTimePercent: 50, station: 'Main Kitchen' });
    expect(r.dishes[1]).toMatchObject({ station: 'Beverages Bar' });
    expect(r.dishes[1].targetMinutes).toBeUndefined();
    expect(r.measured).toBe(3);
    expect(r.stations.map((s) => s.station)).toEqual(['Main Kitchen', 'Beverages Bar']);
  });

  it('counts a dish by its quantity, and counts from the order time when the line has no send time', () => {
    const r = buildPrepTimeReport({ from: FROM, to: TO, orders: [order('p3', { createdAt: day(14, 0), items: [dish('a', 'x', 'X', 'READY', undefined, day(14, 8), 3)] })] });
    expect(r.dishes[0]).toMatchObject({ portions: 3, avgMinutes: 8 });
  });

  it('ignores cancelled dishes and dishes still cooking, and sets aside a done dish with no time or a ticket left open all night', () => {
    const r = buildPrepTimeReport({
      from: FROM, to: TO,
      orders: [order('p4', { items: [
        dish('a', 'a', 'A', 'CANCELLED', day(12, 0), day(12, 5)),
        dish('b', 'b', 'B', 'PREPARING', day(12, 0)),
        dish('c', 'c', 'C', 'READY', day(12, 0), day(23, 0)),
        dish('d', 'd', 'D', 'READY', day(12, 0))
      ] })]
    });
    expect(r.dishes).toEqual([]);
    expect(r.unmeasured).toBe(2);
  });

  it('leaves out dishes sent outside the period', () => {
    const r = buildPrepTimeReport({ from: FROM, to: TO, orders: [order('p5', { items: [dish('a', 'a', 'A', 'READY', '2026-09-01T12:00:00.000Z', '2026-09-01T12:10:00.000Z')] })] });
    expect(r.measured).toBe(0);
  });
});

describe('labour cost against sales', () => {
  const rec = (userId: string, date: string, extra: Partial<AttendanceRecord> = {}): AttendanceRecord => ({ id: `${userId}${date}`, userId, userName: userId.toUpperCase(), date, status: 'PRESENT', ...extra });
  const base = { fromDate: '2026-09-28', toDate: '2026-09-28', now: new Date(Date.UTC(2026, 8, 28, 20, 0)), todayKey: '2026-09-28', schedules: [] as StaffShiftSchedule[] };

  it('multiplies clocked hours by the hourly rate and shows cost as a share of sales', () => {
    const r = buildLabourReport({ ...base, sales: 10000, payRates: { ravi: 100, asha: 150 }, attendance: [rec('ravi', '2026-09-28', { clockInAt: day(9), clockOutAt: day(17) }), rec('asha', '2026-09-28', { clockInAt: day(10), clockOutAt: day(14) })] });
    expect(r.totalHours).toBe(12);
    expect(r.totalCost).toBe(1400);
    expect(r.labourPercentOfSales).toBe(14);
    expect(r.salesPerLabourHour).toBeCloseTo(833.33, 2);
  });

  it('counts someone still clocked in today up to now, and never guesses a forgotten clock-out on an earlier day', () => {
    const still = buildLabourReport({ ...base, sales: 0, payRates: { ravi: 100 }, attendance: [rec('ravi', '2026-09-28', { clockInAt: day(12) })] });
    expect(still.rows[0].hours).toBe(8);
    const forgotten = buildLabourReport({ ...base, fromDate: '2026-09-27', sales: 0, payRates: { ravi: 100 }, attendance: [rec('ravi', '2026-09-27', { clockInAt: '2026-09-27T09:00:00.000Z' })] });
    expect(forgotten.rows[0]).toMatchObject({ hours: 0, missingClockOut: 1 });
  });

  it('names staff who worked with no rate entered, so the total is not silently low', () => {
    const r = buildLabourReport({ ...base, sales: 5000, payRates: {}, attendance: [rec('ravi', '2026-09-28', { clockInAt: day(9), clockOutAt: day(13) })] });
    expect(r.missingRate).toEqual(['RAVI']);
    expect(r.totalCost).toBe(0);
    expect(r.labourPercentOfSales).toBeUndefined();
  });

  it('counts scheduled hours (including a shift past midnight), late and absent days', () => {
    const sched: StaffShiftSchedule = { id: 's', userId: 'ravi', userName: 'RAVI', date: '2026-09-28', startTime: '22:00', endTime: '02:00', createdAt: '' };
    const r = buildLabourReport({ ...base, sales: 0, payRates: {}, schedules: [sched], attendance: [rec('ravi', '2026-09-28', { status: 'ABSENT' })] });
    expect(r.rows[0]).toMatchObject({ scheduledHours: 4, absentDays: 1 });
  });
});

describe('split bill: by seat, by dish, or equally, always to the paisa', () => {
  const lines = [
    { id: 'a', name: 'Paneer', quantity: 1, amount: 250, seat: 1 },
    { id: 'b', name: 'Naan', quantity: 2, amount: 80, seat: 1 },
    { id: 'c', name: 'Biryani', quantity: 1, amount: 320, seat: 2 },
    { id: 'd', name: 'Nachos (shared)', quantity: 1, amount: 150 }
  ];
  const bill = { discountAmount: 30, taxAmount: 35.5, serviceChargeAmount: 0, tipAmount: 0, totalAmount: 805.5 };
  const sum = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100;

  it('gives each seat its own dishes and its share of discount and tax, and the shares add up to the bill exactly', () => {
    const r = splitBill(lines, bill, groupsBySeat(lines));
    expect(r.unassigned).toEqual([]);
    expect(r.shares.map((s) => s.label)).toEqual(['Seat 1', 'Seat 2', 'Shared / no seat']);
    expect(r.shares[0].subtotal).toBe(330);
    expect(sum(r.shares.map((s) => s.total))).toBe(805.5);
    expect(sum(r.shares.map((s) => s.tax))).toBe(35.5);
    expect(sum(r.shares.map((s) => s.discount))).toBe(30);
  });

  it('divides a dish two guests both name equally between them', () => {
    const groups = [{ label: 'Ana', lineIds: ['a', 'd'] }, { label: 'Ben', lineIds: ['c', 'd'] }];
    const r = splitBill(lines.slice(), { ...bill, totalAmount: 805.5 }, groups);
    expect(r.shares[0].subtotal).toBe(325);
    expect(r.shares[1].subtotal).toBe(395);
    expect(r.unassigned).toEqual(['b']);
  });

  it('splits three ways with no paisa lost or invented, even when the total does not divide', () => {
    const r = splitBill(lines, { ...bill, totalAmount: 100 }, groupsEqually(lines, 3));
    expect(r.shares.map((s) => s.total)).toEqual([33.34, 33.33, 33.33]);
    expect(sum(r.shares.map((s) => s.total))).toBe(100);
  });

  it('will not settle while a dish has no guest, refuses a dish that is not on the bill, and skips cancelled lines', () => {
    const partial = splitBill(lines, bill, [{ label: 'Ana', lineIds: ['a'] }]);
    expect(partial.unassigned).toEqual(['b', 'c', 'd']);
    expect(splitBill(lines, bill, [{ label: 'Ana', lineIds: ['zzz'] }]).error).toMatch(/not on this bill/);
    expect(splitBill(lines, bill, []).error).toMatch(/at least one guest/);
    const cancelled = [...lines, { id: 'x', name: 'Cancelled', quantity: 1, amount: 0 }];
    expect(splitBill(cancelled, bill, groupsBySeat(cancelled)).unassigned).toEqual([]);
  });

  it('adds up what each way of paying has to collect when every guest pays their own share their own way', () => {
    const r = splitBill(lines, bill, groupsBySeat(lines));
    const by = amountsByMethod(r.shares, ['CASH', 'UPI', 'UPI']);
    expect(by.CASH).toBe(r.shares[0].total);
    expect(by.UPI).toBe(sum([r.shares[1].total, r.shares[2].total]));
    expect(by.CARD).toBe(0);
    expect(sum([by.CASH, by.UPI, by.CARD])).toBe(805.5);
  });

  it('allocates any total across any weights exactly, including negative round-offs', () => {
    expect(allocatePaise(-5, [1, 1, 1]).reduce((s, v) => s + v, 0)).toBe(-5);
    expect(allocatePaise(10, [0, 0]).reduce((s, v) => s + v, 0)).toBe(10);
    expect(allocatePaise(1000, [333, 333, 334])).toEqual([333, 333, 334]);
  });
});

describe('a booked table is held before the guest arrives', () => {
  const res = (minutesFromNow: number, extra: Partial<Reservation> = {}): Reservation => ({
    id: 'r1', customerName: 'Sharma', customerPhone: '9', guestCount: 4, tableId: 't5', tableNumber: '5', reservationTime: new Date(NOW.getTime() + minutesFromNow * 60000).toISOString(), status: 'CONFIRMED', createdAt: '', ...extra
  });
  const NOW = new Date(Date.UTC(2026, 8, 28, 19, 0));
  const table = { id: 't5', tableNumber: '5' };

  it('holds the table from 30 minutes before, through the booked time, until 20 minutes after', () => {
    expect(tableHold([res(45)], table, NOW)).toBeUndefined();
    expect(tableHold([res(25)], table, NOW)).toMatchObject({ state: 'UPCOMING', minutesUntil: 25 });
    expect(tableHold([res(-2)], table, NOW)).toMatchObject({ state: 'DUE' });
    expect(tableHold([res(-12)], table, NOW)).toMatchObject({ state: 'LATE' });
    expect(tableHold([res(-25)], table, NOW)).toBeUndefined();
  });

  it('only holds for a confirmed booking, on the right table, and matches by number when the booking has no table id', () => {
    expect(tableHold([res(10, { status: 'SEATED' })], table, NOW)).toBeUndefined();
    expect(tableHold([res(10, { status: 'CANCELLED' })], table, NOW)).toBeUndefined();
    expect(tableHold([res(10, { tableId: 't9', tableNumber: '9' })], table, NOW)).toBeUndefined();
    expect(tableHold([res(10, { tableId: undefined })], table, NOW)).toMatchObject({ state: 'UPCOMING' });
  });

  it('lists bookings past their grace time as no-shows to release', () => {
    expect(overdueReservations([res(-25), res(-5, { id: 'r2' }), res(-30, { id: 'r3', status: 'SEATED' })], NOW).map((r) => r.id)).toEqual(['r1']);
  });
});
