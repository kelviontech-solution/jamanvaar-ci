import type { Order } from '@jamanvaar/types';
export function outstandingBillAmount(order: Pick<Order,'orderStatus'|'paymentStatus'|'totalAmount'|'paymentAllocationSummary'>): number {
  if (['DRAFT','CANCELLED','REFUNDED'].includes(order.orderStatus) || ['SUCCESS','REFUNDED','CANCELLED'].includes(order.paymentStatus)) return 0;
  const amount = order.paymentAllocationSummary?.outstandingPaise === undefined ? order.totalAmount : order.paymentAllocationSummary.outstandingPaise/100;
  return Number.isFinite(amount) ? Math.max(0,Math.round(amount*100)/100) : 0;
}
