/**
 * The business rules that decide how concurrent writes to one order combine. These are the same rules the
 * cloud applies (cloud/api/src/modules/order-sync/order-merge.ts holds an identical copy of
 * mergeOrderItems/kitchenStatusRank; tests/branch_core_rules_parity.test.ts fails if the two ever drift),
 * so an order behaves identically whether the branch core or the cloud processed it.
 */

export interface MergeableItem {
  externalItemId: string;
  kitchenStatus?: string;
  originDeviceId?: string;
  [key: string]: unknown;
}

const KITCHEN_RANK: Record<string, number> = {
  PENDING: 0, NEW: 0, QUEUED: 0,
  PREPARING: 1, COOKING: 1,
  READY: 2,
  SERVED: 3, COMPLETED: 3, DELIVERED: 3,
  CANCELLED: 4, VOID: 4, VOIDED: 4
};

export function kitchenStatusRank(status: string | undefined): number {
  return status ? (KITCHEN_RANK[status.toUpperCase()] ?? 0) : 0;
}

export function mergeOrderItems<T extends MergeableItem>(
  existing: T[] | undefined,
  incoming: T[],
  deviceId: string
): { items: T[]; foreignItemsKept: boolean } {
  const prior = existing ?? [];
  const incomingIds = new Set(incoming.map((i) => i.externalItemId));
  const priorById = new Map(prior.map((i) => [i.externalItemId, i]));

  const merged: T[] = incoming.map((inc) => {
    const old = priorById.get(inc.externalItemId);
    const status =
      old && kitchenStatusRank(old.kitchenStatus) > kitchenStatusRank(inc.kitchenStatus) ? old.kitchenStatus : inc.kitchenStatus;
    return { ...inc, kitchenStatus: status, originDeviceId: old?.originDeviceId ?? deviceId };
  });

  let foreignItemsKept = false;
  for (const old of prior) {
    if (incomingIds.has(old.externalItemId)) continue;
    // Absent from this push: only the device that added it may remove it.
    if (old.originDeviceId && old.originDeviceId !== deviceId) {
      merged.push(old);
      foreignItemsKept = true;
    } else if (!old.originDeviceId && prior.length > 0 && incoming.length === 0) {
      merged.push(old); // legacy item with no owner: never drop everything on an empty push
    }
  }
  return { items: merged, foreignItemsKept };
}

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
