// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { db, BusinessDayRepository, BusinessDayAccountingService, OrderRepository, ShiftRepository, KeyValueStore, getNetOrderTenders, CustomerRepository } from '@jamanvaar/database';
import { buildShiftSummary, BusinessDayService, SessionPersistence, DayOrdersService } from '@jamanvaar/business';
import { SyncOutboxEngine } from '@jamanvaar/sync';
import { PosShiftAndCashView } from '../apps/restaurant-system/pos/src/components/shift/PosShiftAndCashView';
import { usePosStore } from '../apps/restaurant-system/pos/src/store/posStore';
import { refundBillingOrder, voidBillingOrder } from '../apps/restaurant-system/pos-admin/src/components/billing/billingCommands';
import * as cloud from '../apps/restaurant-system/pos-admin/src/cloud/cloudClient';
import { QrAdminApi } from '../apps/restaurant-system/pos-admin/src/cloud/qrAdminClient';
import { PdfReportBuilder } from '../apps/restaurant-system/pos/src/services/pdfReportBuilder';
import { OrderDetailModal } from '../apps/restaurant-system/pos-admin/src/components/OrderDetailModal';
import { BillingInvoicesModule } from '../apps/restaurant-system/pos-admin/src/components/billing/BillingInvoicesModule';
import type { Order } from '@jamanvaar/types';

let root: Root | undefined, container: HTMLDivElement | undefined;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear(); KeyValueStore.reset(); db.resetToDefaultSeed();
  db.orders = []; db.shifts = []; db.kots = []; db.cashMovements = []; db.auditLogs = []; db.businessDays = [];
  BusinessDayRepository.getActiveBusinessDay();
  SessionPersistence.save('admin', { userId: 'owner', fullName: 'Actual Owner', roleId: 'role-admin', restaurantId: db.restaurant.id });
});
afterEach(() => { if (root) act(() => root!.unmount()); container?.remove(); root = undefined; container = undefined; vi.restoreAllMocks(); vi.useRealTimers(); });
function paid(patch: Partial<Order> = {}) { return OrderRepository.createOrder({ items: [], totalAmount: 250, subtotal: 250, paymentMethod: 'CASH', paymentStatus: 'SUCCESS', orderStatus: 'COMPLETED', orderType: 'TAKEAWAY', ...patch }); }
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes(text))!;

describe('Remaining financial and usability gaps', () => {
  it('blocks voiding a partly collected bill without touching its status', async () => {
    const order = paid({ paymentStatus: 'PARTIALLY_PAID', orderStatus: 'PREPARING' });
    order.paymentAllocationSummary = { collectedPaise: 10000, outstandingPaise: 15000 };
    await expect(voidBillingOrder(order, 'Wrong entry')).rejects.toThrow(/collection/);
    expect(() => OrderRepository.voidOrder(order.id, 'Wrong entry', 'Owner')).toThrow(/paid/);
    expect(order.orderStatus).toBe('PREPARING');
  });
  it('canonical void cancels kitchen lines and releases the original table', async () => {
    const table = db.tables[0];
    const order = paid({ paymentStatus: 'PENDING', orderStatus: 'PREPARING', tableId: table.id });
    table.currentOrderId = order.id; table.status = 'OCCUPIED';
    db.kots.push({ id: 'kot', orderId: order.id, status: 'PREPARING', items: [{ id: 'line', status: 'PREPARING' }] } as never);
    await voidBillingOrder(order, 'Guest cancelled');
    expect(order.syncStatus).toBe('SAVED_LOCALLY'); expect(db.kots[0].status).toBe('CANCELLED');
    expect(table.status).toBe('AVAILABLE'); expect(db.auditLogs.some(log => log.username === 'Actual Owner')).toBe(true);
  });
  it('requires a genuine manager session, reason and returned-money confirmation', async () => {
    const order = paid();
    await expect(refundBillingOrder(order, 'Returned', false, 'CASH')).rejects.toThrow(/confirm/);
    SessionPersistence.clear('admin');
    await expect(refundBillingOrder(order, 'Returned', true, 'CASH')).rejects.toThrow(/Sign in/);
    expect(order.orderStatus).toBe('COMPLETED');
  });
  it('a cashier-confirmed UPI return remains a manual record and leaves drawer cash intact', async () => {
    const shift = ShiftRepository.openShift('a', 'Asha', 100, 'counter-a');
    const order = paid({ shiftId: shift.id, paymentMethod: 'UPI_QR' });
    order.paymentConfirmation = { kind: 'CASHIER_CONFIRMED', actor: 'Asha', at: order.createdAt, reference: 'bank-confirmed-reference' };
    const lookup = vi.spyOn(cloud, 'getRecentPayments');
    await refundBillingOrder(order, 'Returned through UPI', true, 'UPI_TO_CUSTOMER');
    expect(lookup).not.toHaveBeenCalled(); expect(order.paymentStatus).toBe('REFUNDED'); expect(shift.expectedCash).toBe(100);
  });
  it('cash refund adjusts its collecting register, never the other open register', async () => {
    const a = ShiftRepository.openShift('a', 'Asha', 100, 'counter-a');
    const b = ShiftRepository.openShift('b', 'Bina', 500, 'counter-b');
    const order = paid({ shiftId: a.id, kioskId: 'counter-a' });
    await refundBillingOrder(order, 'Returned cash', true, 'CASH');
    expect(a.expectedCash).toBe(100); expect(b.expectedCash).toBe(500);
    expect(order.paymentStatus).toBe('REFUNDED');
    expect(BusinessDayRepository.recalculateMetrics(order.businessDayId!)?.totalCollected).toBe(0);
    await expect(refundBillingOrder(order, 'Returned cash', true, 'CASH')).rejects.toThrow(/unrefunded/);
  });
  it('refund rollback preserves the paid bill and drawer if loyalty bookkeeping fails', () => {
    const shift = ShiftRepository.openShift('a', 'Asha', 100, 'counter-a');
    CustomerRepository.createCustomer({ phone: '9876543210', name: 'Customer' });
    const order = paid({ shiftId: shift.id, customerPhone: '9876543210' });
    order.loyaltyPointsEarned = 5;
    vi.spyOn(CustomerRepository, 'recordLoyaltyEvent').mockImplementation(() => { throw new Error('Ledger failure'); });
    expect(() => OrderRepository.refundOrder(order.id, 250, 'Return', 'Owner')).toThrow('Ledger failure');
    expect(db.orders.find(row => row.id === order.id)?.paymentStatus).toBe('SUCCESS');
    expect(ShiftRepository.getActiveShift('counter-a')?.expectedCash).toBe(350);
    expect(db.auditLogs.some(log => log.action === 'REFUND')).toBe(false);
  });
  it('refuses late local refunds and invalid amounts without rewriting closed cash counts', () => {
    const shift = ShiftRepository.openShift('a', 'Asha', 0, 'counter-a'); const order = paid({ shiftId: shift.id });
    ShiftRepository.closeShift(shift.id, 250);
    expect(() => OrderRepository.refundOrder(order.id, 250, 'Return', 'Owner')).toThrow(/closed/);
    expect(shift.actualCash).toBe(250); expect(order.orderStatus).toBe('COMPLETED');
    expect(() => OrderRepository.refundOrder(order.id, NaN, 'Return', 'Owner')).toThrow(/amount/);
  });
  it('online refund retries keep the same key after a lost response and do not invent local success', async () => {
    const order = paid({ paymentMethod: 'UPI_QR', source_type: 'KIOSK' });
    vi.spyOn(cloud, 'getRecentPayments').mockResolvedValue([{ id: 'online-id', externalOrderId: order.id, amount: 25000, refundableAmount: 25000, status: 'SUCCESS' } as never]);
    const refund = vi.spyOn(cloud, 'createRefund').mockRejectedValueOnce(new Error('Lost response')).mockResolvedValue({ refundId: 'r', providerRefundId: 'r', status: 'SUCCESS', amount: 25000 });
    vi.spyOn(SyncOutboxEngine, 'catchUpFromCloud').mockResolvedValue({ pulled: 0, created: 0 });
    await expect(refundBillingOrder(order, 'Returned via UPI', true, 'UPI_TO_CUSTOMER')).rejects.toThrow('Lost response');
    await refundBillingOrder(order, 'Returned via UPI', true, 'UPI_TO_CUSTOMER');
    expect(refund.mock.calls[0][5]).toBe(refund.mock.calls[1][5]);
    expect(cloud.getRecentPayments).toHaveBeenCalledWith(order.id); expect(order.orderStatus).toBe('COMPLETED');
  });
  it('QR counter refund uses the authorized advanced ledger endpoint and current version', async () => {
    const order = paid({ source_type: 'QR_TABLE', paymentMethod: 'CASH_AT_COUNTER' });
    vi.spyOn(QrAdminApi, 'orders').mockResolvedValue([{ id: order.id, version: 7 } as never]);
    const api = vi.spyOn(cloud, 'qrApi').mockResolvedValue({}); vi.spyOn(SyncOutboxEngine, 'catchUpFromCloud').mockResolvedValue({ pulled: 0, created: 0 });
    await refundBillingOrder(order, 'Returned cash', true, 'CASH');
    expect(api.mock.calls[0][0]).toBe(`/api/v1/restaurant/qr/advanced/orders/${encodeURIComponent(order.id)}/refund-cash`);
    expect(JSON.parse(api.mock.calls[0][1]!.body as string).version).toBe(7); expect(order.orderStatus).toBe('COMPLETED');
  });
  it('date rollover leaves the previous day unsettled with no fabricated count', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T20:00:00Z')); db.businessDays = [];
    const old = BusinessDayRepository.getActiveBusinessDay();
    vi.setSystemTime(new Date('2026-10-12T01:00:00Z')); const current = BusinessDayRepository.getActiveBusinessDay();
    expect(old.status).toBe('CLOSING'); expect(old.closedAt).toBeUndefined(); expect(old.closingCash).toBeUndefined();
    expect(current.businessDate).toBe('2026-10-12'); expect(BusinessDayRepository.getActiveBusinessDay().id).toBe(current.id);
    expect(db.businessDays).toHaveLength(2);
  });
  it('honors the configured rollover hour including midnight without changing tagged historical bills', () => {
    db.restaurant.businessDayCutoffHour = 3;
    expect(BusinessDayRepository.getCanonicalBusinessDate(new Date('2026-10-12T22:00:00Z')).dateKey).toBe('2026-10-13');
    db.restaurant.businessDayCutoffHour = 5;
    expect(BusinessDayRepository.getCanonicalBusinessDate(new Date('2026-10-12T22:00:00Z')).dateKey).toBe('2026-10-12');
    db.restaurant.businessDayCutoffHour = 0;
    expect(BusinessDayRepository.getCanonicalBusinessDate(new Date('2026-10-12T19:00:00Z')).dateKey).toBe('2026-10-13');
    expect(DayOrdersService.getBusinessDateKey('2026-10-12T19:00:00Z')).toBe('2026-10-13');
  });
  it('daily refund rows retain the actual partial amount and recorded approving actor', () => {
    const order = paid(); OrderRepository.refundOrder(order.id, 50, 'One dish returned', 'Actual Owner');
    const summary = DayOrdersService.getDaySummary([order], BusinessDayRepository.getActiveBusinessDay().businessDate);
    expect(summary.refunds).toBe(50);
    expect(summary.refundsList[0]).toMatchObject({ refundAmount: 50, approvedBy: 'Actual Owner', reason: 'One dish returned' });
  });
  it('reconciling yesterday leaves today’s register and kitchen queue intact', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T10:00:00Z')); db.businessDays = [];
    const old = BusinessDayRepository.getActiveBusinessDay();
    vi.setSystemTime(new Date('2026-10-12T10:00:00Z')); const today = BusinessDayRepository.getActiveBusinessDay();
    const shift = ShiftRepository.openShift('today-cashier', 'Today', 50, 'today-counter');
    const order = paid({ businessDayId: today.id, shiftId: shift.id, paymentStatus: 'PENDING', orderStatus: 'PREPARING' });
    db.kots.push({ id: 'today-kot', orderId: order.id, status: 'PREPARING' } as never);
    const result = BusinessDayService.closeBusinessDay({ businessDayId: old.id, actualCash: 0 });
    expect(result.newDay.id).toBe(today.id); expect(shift.status).toBe('OPEN'); expect(db.kots).toHaveLength(1); expect(db.businessDays).toHaveLength(2);
  });
  it('a register spanning rollover must be counted independently before yesterday is finalized', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T10:00:00Z')); db.businessDays = [];
    const old = BusinessDayRepository.getActiveBusinessDay();
    const shift = ShiftRepository.openShift('cashier', 'Overnight cashier', 100, 'night-counter');
    vi.setSystemTime(new Date('2026-10-12T10:00:00Z')); const today = BusinessDayRepository.getActiveBusinessDay();
    paid({ businessDayId: today.id, shiftId: shift.id, kioskId: 'night-counter' });
    expect(() => BusinessDayService.closeBusinessDay({ businessDayId: old.id, actualCash: 100 })).toThrow(/each register/);
    expect(shift.status).toBe('OPEN'); expect(old.status).toBe('CLOSING');
  });
  it('overnight legacy register bills are included and other registers excluded', () => {
    const shift = { id: 'overnight', posId: 'a', openedAt: '2026-10-11T17:00:00Z', closedAt: '2026-10-12T01:30:00Z' } as never;
    expect(ShiftRepository.getShiftOrders(shift, [{ kioskId: 'a', createdAt: '2026-10-12T00:30:00Z' }, { kioskId: 'b', createdAt: '2026-10-12T00:30:00Z' }] as Order[])).toHaveLength(1);
  });
  it('mixed shift report preserves paise, actual order types, wallet, split and returns in its PDF', () => {
    const shift = ShiftRepository.openShift('a', 'Asha', 0, 'counter-a');
    paid({ shiftId: shift.id, totalAmount: 100.25, subtotal: 100.25, orderType: 'DELIVERY', paymentMethod: 'WALLET' });
    paid({ shiftId: shift.id, totalAmount: 200, subtotal: 200, orderType: 'DINE_IN', paymentMethod: 'SPLIT', paymentSplits: [{ method: 'CASH', amount: 20 }, { method: 'UPI', amount: 180 }] });
    const returned = paid({ shiftId: shift.id, totalAmount: 50, subtotal: 50, orderType: 'TOKEN' });
    OrderRepository.refundOrder(returned.id, 50, 'Returned', 'Owner');
    const summary = buildShiftSummary(shift, db.orders);
    expect(summary.totalCollected).toBe(300.25); expect(summary.paymentBreakdown.wallet).toBe(100.25);
    expect(summary.paymentBreakdown.cash).toBe(20); expect(summary.paymentBreakdown.split).toBe(200);
    expect(summary.orderTypeBreakdown.delivery.count).toBe(1); expect(summary.orderTypeBreakdown.takeaway.count).toBe(0); expect(summary.refundsAmount).toBe(50);
    const pdf = new TextDecoder().decode(PdfReportBuilder.generatePdf({ title: 'Shift', periodLabel: 'Mixed shift', startDate: shift.openedAt, endDate: shift.openedAt, generatedAt: shift.openedAt, generatedBy: 'Owner', summary, topItems: [], cashiers: [] }));
    expect(pdf).toContain('Wallet'); expect(pdf).toContain('Returned payments'); expect(pdf).toContain('ORDER TYPES');
  });
  it('partial cash return and paid-out movement reconcile consistently across shift and day', () => {
    const day = BusinessDayRepository.getActiveBusinessDay(); const shift = ShiftRepository.openShift('a', 'Asha', 100, 'a');
    const order = paid({ shiftId: shift.id }); OrderRepository.refundOrder(order.id, 50, 'Partial return', 'Owner');
    ShiftRepository.getActiveShift('a'); ShiftRepository.addCashMovement(shift.id, 'CASH_OUT', 20, 'Expense', 'Asha');
    expect(ShiftRepository.getShiftMetrics(shift).expectedCash).toBe(280);
    expect(BusinessDayAccountingService.getBusinessDaySummary(day.id).cash_expected).toBe(280);
    expect(BusinessDayRepository.recalculateMetrics(day.id)?.totalCollected).toBe(200);
  });
  it('legacy partial split returns stay unattributed instead of inventing cash', () => {
    const order = paid({ paymentMethod: 'SPLIT', paymentSplits: [{ method: 'CASH', amount: 100 }, { method: 'UPI', amount: 150 }] });
    order.refundAmount = 50; order.orderStatus = 'REFUNDED';
    expect(getNetOrderTenders(order)).toMatchObject({ cash: 0, upi: 0, other: 200 });
  });
  it('repository rejects blank discrepancy reason, invalid cash and repeated close', () => {
    const shift = ShiftRepository.openShift('a', 'Asha', 100, 'a');
    expect(() => ShiftRepository.closeShift(shift.id, 0)).toThrow(/Explain/);
    expect(() => ShiftRepository.closeShift(shift.id, -1, 'Reason')).toThrow(/valid/);
    ShiftRepository.closeShift(shift.id, 100); expect(() => ShiftRepository.closeShift(shift.id, 0, 'Second count')).toThrow(/already closed/);
    expect(shift.actualCash).toBe(100);
  });
  it('day closure cannot infer a counted amount or substitute a discrepancy explanation', () => {
    expect(() => BusinessDayService.closeBusinessDay({ forceCloseWithExceptions: true })).toThrow(/Count the cash/);
    expect(() => BusinessDayService.closeBusinessDay({ actualCash: 50, forceCloseWithExceptions: true })).toThrow(/Explain/);
    expect(BusinessDayRepository.getActiveBusinessDay().status).toBe('OPEN');
  });
  it('untouched empty till cannot close; explicitly confirmed zero can close', () => {
    const shift = ShiftRepository.openShift('owner', 'Owner', 0, 'fixture-counter');
    usePosStore.setState({ currentUser: { id: 'owner', fullName: 'Owner', roleId: 'role-admin' } as never, posTerminalId: 'fixture-counter' });
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    act(() => root!.render(<PosShiftAndCashView/>)); act(() => button('Close Shift').click());
    expect(button('Finalize & Close Shift').disabled).toBe(true);
    act(() => document.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
    expect(button('Finalize & Close Shift').disabled).toBe(false);
    act(() => button('Finalize & Close Shift').click()); expect(shift.status).toBe('CLOSED'); expect(shift.actualCash).toBe(0);
  });
  it('the separate order-details refund form also requires returned-money confirmation and blocks paid voids', () => {
    const shift = ShiftRepository.openShift('a', 'Asha', 0, 'counter-a'); const order = paid({ shiftId: shift.id });
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    act(() => root!.render(<OrderDetailModal order={order} isOpen onClose={() => {}} onOrderUpdated={() => {}}/>));
    expect(button('Void Order').disabled).toBe(true);
    act(() => button('Refund Order').click());
    expect(button('Record returned payment').disabled).toBe(true);
    expect(document.body.textContent).toContain('already been returned');
  });
  it('pending billing details never claim the payment is fully settled', () => {
    const order = paid({ paymentStatus: 'PENDING' });
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    act(() => root!.render(<BillingInvoicesModule orders={[order]} onOrderUpdated={() => {}} showToast={() => {}}/>));
    act(() => button('View').click());
    expect(document.body.textContent).toContain('Payment Status: PENDING');
    expect(document.body.textContent).not.toContain('FULLY SETTLED');
  });
  it('Admin order details show actual partial collection and outstanding balance', () => {
    const order = paid({ paymentStatus: 'PARTIALLY_PAID', orderStatus: 'PREPARING' });
    order.paymentAllocationSummary = { collectedPaise: 10000, outstandingPaise: 15000 };
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    act(() => root!.render(<OrderDetailModal order={order} isOpen onClose={() => {}} onOrderUpdated={() => {}} />));
    const settlement = [...document.querySelectorAll('span')].find(node => node.textContent === 'PAYMENT SETTLEMENT')!.parentElement!;
    expect(settlement.textContent).toContain('₹100'); expect(settlement.textContent).toContain('₹150');
    expect(settlement.textContent).not.toContain('FULLY PAID');
  });
  it('partial local returns record the amount entered instead of silently defaulting zero to the bill total', async () => {
    const shift = ShiftRepository.openShift('a', 'Asha', 0, 'counter-a'); const order = paid({ shiftId: shift.id });
    await expect(refundBillingOrder(order, 'Return', true, 'CASH', 0)).rejects.toThrow(/amount/);
    await refundBillingOrder(order, 'One item returned', true, 'CASH', 50);
    expect(order.refundAmount).toBe(50); expect(ShiftRepository.getShiftMetrics(shift).expectedCash).toBe(200);
  });
  it('a partial return cannot mark the remaining kitchen work served', () => {
    const order = paid({ orderStatus: 'PREPARING' });
    db.kots.push({ id: 'partial-ticket', orderId: order.id, status: 'PREPARING', items: [{ id: 'dish', status: 'PREPARING' }] } as never);
    OrderRepository.refundOrder(order.id, 50, 'One returned item', 'Owner');
    expect(order.orderStatus).toBe('PREPARING');
    expect(() => OrderRepository.refundOrder(order.id, 50, 'Repeat', 'Owner')).toThrow(/already/);
    expect(db.kots[0].status).toBe('PREPARING');
  });
});
