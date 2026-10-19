import { recordedOrderBalance, type Order } from '@jamanvaar/types';
export function outstandingBillAmount(order: Pick<Order,'orderStatus'|'paymentStatus'|'totalAmount'|'paymentAllocationSummary'>): number {
  return recordedOrderBalance(order).outstandingPaise / 100;
}
