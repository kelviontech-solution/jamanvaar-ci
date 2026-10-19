import type { Order } from './domain';

export type OrderBalanceInput = Pick<Order, 'totalAmount' | 'paymentStatus' | 'paymentAllocationSummary'>
  & Partial<Pick<Order, 'orderStatus' | 'refundAmount'>>;

const paise = (value: number) => Number.isFinite(value) ? Math.max(0, Math.round(value * 100)) : 0;

/** Shared recorded balance; selecting a tender or serving food never proves collection. */
export function recordedOrderBalance(order: OrderBalanceInput) {
  const amount = paise(order.totalAmount);
  const inactive = ['DRAFT', 'CANCELLED'].includes(order.orderStatus ?? '');
  const fullyReturned = order.paymentStatus === 'REFUNDED' || order.orderStatus === 'REFUNDED';
  const fullyPaid = ['SUCCESS', 'PAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'REFUND_PENDING'].includes(order.paymentStatus ?? '') || order.orderStatus === 'REFUNDED';
  const collectedPaise = inactive ? 0 : Math.min(amount, order.paymentAllocationSummary?.collectedPaise !== undefined
    ? paise(order.paymentAllocationSummary.collectedPaise / 100) : fullyPaid ? amount : 0);
  const returned = inactive ? 0 : Math.min(amount, paise(order.refundAmount ?? (fullyReturned ? order.totalAmount : 0)));
  const refundedPaise = Math.min(collectedPaise, returned);
  const outstandingPaise = inactive || fullyReturned ? 0 : Math.min(amount,
    order.paymentAllocationSummary?.outstandingPaise !== undefined
      ? paise(order.paymentAllocationSummary.outstandingPaise / 100) : Math.max(0, amount - collectedPaise));
  return { totalPaise: inactive ? 0 : amount, collectedPaise, refundedPaise,
    netCollectedPaise: Math.max(0, collectedPaise - refundedPaise), outstandingPaise };
}
