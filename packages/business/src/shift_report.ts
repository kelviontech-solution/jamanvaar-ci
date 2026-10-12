import type { Order, ShiftRecord } from '@jamanvaar/types';
import { orderPaymentPosition, ShiftRepository } from '@jamanvaar/database';
import type { DailyReportSummary } from './report_generator';

/** A shift statement uses its own bills; split is a subset, not an extra tender. */
export function buildShiftSummary(shift: ShiftRecord, allOrders: Order[]): DailyReportSummary {
  const orders = ShiftRepository.getShiftOrders(shift, allOrders);
  const money = (n: number) => Math.round(n * 100) / 100;
  const summary: DailyReportSummary = {
    dateStr: `Shift ${shift.id}`, grossSales: 0, discountAmount: 0, netSales: 0,
    cgstAmount: 0, sgstAmount: 0, totalTax: 0, totalCollected: 0,
    refundsCount: 0, refundsAmount: 0, cancelledCount: 0, ordersCount: 0, avgOrderValue: 0,
    paymentBreakdown: { cash: 0, upi: 0, card: 0, wallet: 0, split: 0, other: 0 },
    orderTypeBreakdown: { dineIn: { count: 0, total: 0 }, takeaway: { count: 0, total: 0 }, delivery: { count: 0, total: 0 }, token: { count: 0, total: 0 } }
  };
  if (orders.length === 0) {
    const returned = allOrders.flatMap(order => order.refundEvents ?? []).filter(event => event.payingShiftId === shift.id).reduce((sum,event) => sum + event.amountPaise / 100,0);
    summary.totalCollected = ShiftRepository.getShiftMetrics(shift,allOrders).totalSales;
    summary.netSales = summary.totalCollected + returned;
    summary.grossSales = summary.netSales + (shift.totalDiscounts ?? 0);
    summary.discountAmount = shift.totalDiscounts ?? 0;
    summary.ordersCount = shift.totalOrders;
    summary.paymentBreakdown.cash = shift.totalCashSales;
    summary.paymentBreakdown.upi = shift.totalUpiSales;
    summary.paymentBreakdown.card = shift.totalCardSales;
    summary.paymentBreakdown.other = Math.max(0, shift.totalSales - shift.totalCashSales - shift.totalUpiSales - shift.totalCardSales);
  }
  for (const order of orders) {
    if (order.orderStatus === 'CANCELLED') { summary.cancelledCount++; continue; }
    const laterRefund = (order.refundEvents ?? []).filter(event => event.payingShiftId !== shift.id).reduce((sum,event) => sum + event.amountPaise / 100,0);
    const position = orderPaymentPosition({...order,refundAmount:Math.max(0,(order.refundAmount ?? 0) - laterRefund)});
    if (!position.collectedPaise) continue;
    const amount = order.totalAmount;
    const refund = position.refundedPaise / 100;
    const net = position.netCollectedPaise / 100;
    summary.ordersCount++;
    summary.grossSales += order.subtotal ?? amount;
    summary.discountAmount += order.discountAmount ?? 0;
    summary.netSales += amount;
    summary.cgstAmount += order.cgstAmount ?? (order.taxAmount ?? 0) / 2;
    summary.sgstAmount += order.sgstAmount ?? (order.taxAmount ?? 0) - (order.cgstAmount ?? (order.taxAmount ?? 0) / 2);
    summary.totalCollected += net;
    if (refund > 0) { summary.refundsCount++; summary.refundsAmount += refund; }
    const tenders = position.netTenders;
    summary.paymentBreakdown.cash += tenders.cash;
    summary.paymentBreakdown.upi += tenders.upi;
    summary.paymentBreakdown.card += tenders.card;
    summary.paymentBreakdown.wallet += tenders.wallet;
    summary.paymentBreakdown.other += tenders.other + tenders.houseAccount;
    if (order.paymentMethod === 'SPLIT') summary.paymentBreakdown.split += net;
    const key = order.orderType === 'DINE_IN' ? 'dineIn' : order.orderType === 'TAKEAWAY' ? 'takeaway' : order.orderType === 'DELIVERY' ? 'delivery' : 'token';
    summary.orderTypeBreakdown[key].count++;
    summary.orderTypeBreakdown[key].total += net;
  }
  const cohort = new Set(orders.map(order => order.id));
  const external = allOrders.filter(order => !cohort.has(order.id)).flatMap(order => order.refundEvents ?? []).filter(event => event.payingShiftId === shift.id);
  for (const event of external) {
    const amount = event.amountPaise / 100;
    if (orders.length) summary.totalCollected -= amount;
    summary.refundsAmount += amount; summary.refundsCount++;
    summary.paymentBreakdown[event.method === 'CASH' ? 'cash' : 'upi'] -= amount;
  }
  if (shift.status === 'CLOSED') {
    // A historical counted register is a statement, not a lifetime customer balance.
    summary.totalCollected = shift.totalSales;
    const returns = allOrders.flatMap(order => order.refundEvents ?? []).filter(event => event.payingShiftId === shift.id);
    summary.paymentBreakdown.cash = shift.totalCashSales - returns.filter(event => event.method === 'CASH').reduce((sum,event) => sum + event.amountPaise / 100,0);
    summary.paymentBreakdown.upi = shift.totalUpiSales - returns.filter(event => event.method === 'UPI_TO_CUSTOMER').reduce((sum,event) => sum + event.amountPaise / 100,0);
    summary.paymentBreakdown.card = shift.totalCardSales;
    summary.paymentBreakdown.other = money(Math.max(0,shift.totalSales - summary.paymentBreakdown.cash - summary.paymentBreakdown.upi - shift.totalCardSales - summary.paymentBreakdown.wallet));
  }
  for (const key of ['grossSales', 'discountAmount', 'netSales', 'cgstAmount', 'sgstAmount', 'totalCollected', 'refundsAmount'] as const) summary[key] = money(summary[key]);
  summary.totalTax = money(summary.cgstAmount + summary.sgstAmount);
  summary.avgOrderValue = summary.ordersCount ? money(summary.totalCollected / summary.ordersCount) : 0;
  for (const key of Object.keys(summary.paymentBreakdown) as (keyof typeof summary.paymentBreakdown)[]) summary.paymentBreakdown[key] = money(summary.paymentBreakdown[key]);
  for (const value of Object.values(summary.orderTypeBreakdown)) value.total = money(value.total);
  return summary;
}
