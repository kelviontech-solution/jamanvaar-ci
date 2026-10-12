import type { Placed } from './api';

/** Delivered food and collected money have independent lifecycles. */
export function hasOutstandingPayment(order: Placed): boolean {
  if (order.status === 'CANCELLED') return false;
  if (order.balance) return order.balance.outstandingPaise > 0;
  return !['SUCCESS', 'REFUNDED'].includes(order.paymentStatus ?? order.payment?.status ?? '') && order.total > 0;
}

export function shouldRefreshGuestOrder(order: Placed, showService: boolean): boolean {
  return hasOutstandingPayment(order) || (showService && !['COMPLETED', 'CANCELLED'].includes(order.status));
}
