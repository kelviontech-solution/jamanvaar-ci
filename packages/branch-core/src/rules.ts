// Branch core and cloud use the same revision-aware kitchen merge.
export { mergeOrderItems, kitchenStatusRank } from '../../../cloud/api/src/modules/order-sync/order-merge';
export type { MergeableItem } from '../../../cloud/api/src/modules/order-sync/order-merge';

const TERMINAL_PAID_STATUSES: ReadonlySet<string> = new Set(['SUCCESS', 'REFUNDED']);
/** Device types with real payment/refund authority. */
export const PAYMENT_AUTHORITATIVE_DEVICE_TYPES: ReadonlySet<string> = new Set(['POS', 'POS_ADMIN']);

function transactionIdOf(meta: unknown): string | undefined {
  const id = meta && typeof meta === 'object' ? (meta as { paymentTransactionId?: unknown }).paymentTransactionId : undefined;
  return typeof id === 'string' && id ? id : undefined;
}

/** Whether a push may change an order's payment state. Null means allowed. */
export function paymentViolation(
  existing: { paymentStatus: string | null; deviceId: string | null; meta: unknown },
  incoming: { paymentStatus?: string; meta?: unknown },
  device: { id: string; type: string }
): { code: string; message: string } | null {
  if (!existing.paymentStatus || !TERMINAL_PAID_STATUSES.has(existing.paymentStatus)) return null;
  if (incoming.paymentStatus === undefined || incoming.paymentStatus === existing.paymentStatus) {
    const paidWith = transactionIdOf(existing.meta);
    const other = transactionIdOf(incoming.meta);
    if (existing.paymentStatus === 'SUCCESS' && paidWith && other && paidWith !== other) {
      return { code: 'ORDER_ALREADY_PAID', message: 'This order was already paid by another transaction' };
    }
    return null;
  }
  if (existing.paymentStatus === 'SUCCESS' && incoming.paymentStatus === 'REFUNDED') {
    const mayRefund = PAYMENT_AUTHORITATIVE_DEVICE_TYPES.has(device.type) || existing.deviceId === device.id;
    return mayRefund ? null : { code: 'REFUND_NOT_AUTHORIZED', message: 'This device cannot refund a payment it did not record' };
  }
  return { code: 'PAYMENT_STATUS_FINAL', message: 'A settled order cannot go back to an unpaid state' };
}
