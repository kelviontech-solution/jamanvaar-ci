import type { Order } from '@jamanvaar/types';
import { db, KeyValueStore, OrderRepository } from '@jamanvaar/database';
import { SessionPersistence } from '@jamanvaar/business';
import { getOrderSource } from '@jamanvaar/utils';
import { SyncOutboxEngine, syncShifts } from '@jamanvaar/sync';
import { createRefund, getRecentPayments, qrApi, type RefundMethod } from '../../cloud/cloudClient';
import { QrAdminApi } from '../../cloud/qrAdminClient';

function managerName(): string {
  const session = SessionPersistence.load('admin');
  if (!session || session.locked || session.restaurantId !== db.restaurant.id || !['role-admin', 'role-manager'].includes(session.roleId)) {
    throw new Error('Sign in as the restaurant owner or manager before changing a bill.');
  }
  return session.fullName;
}

/** Persisted across a lost response/reload. A changed reason is a new operation. */
function refundAttempt(order: Order, amount: number, reason: string, method: string): string {
  const key = `billing-refund:${db.restaurant.id}:${order.id}:${amount}:${method}:${reason}`;
  const existing = KeyValueStore.get(key);
  if (existing) return existing;
  const attempt = crypto.randomUUID();
  KeyValueStore.set(key, attempt);
  return attempt;
}

export async function refundBillingOrder(order: Order, reason: string, returned: boolean, method: RefundMethod, amount: number = order.totalAmount, payingShiftId?: string): Promise<string> {
  const actor = managerName();
  if (!reason.trim() || !returned) throw new Error('Enter a reason and confirm the money was returned to the customer.');
  if (order.paymentStatus !== 'SUCCESS' || order.refundAmount || ['REFUNDED', 'CANCELLED'].includes(order.orderStatus)) throw new Error('Only a fully paid, unrefunded bill can be refunded here. Use the payment ledger for partial refunds.');
  if (!Number.isFinite(amount) || amount <= 0 || amount > order.totalAmount) throw new Error('Enter a return amount greater than zero and no more than the paid bill.');
  const key = refundAttempt(order, amount, reason.trim(), method);
  const qr = getOrderSource(order) === 'QR_TABLE';
  if (qr && order.paymentMethod === 'CASH_AT_COUNTER') {
    if (method !== 'CASH') throw new Error('This counter cash bill must be recorded as a cash refund.');
    const current = (await QrAdminApi.orders(db.outlet.id)).find(row => row.id === order.id);
    if (!current) throw new Error('This QR bill is unavailable in the selected branch. Refresh before retrying.');
    await qrApi(`/api/v1/restaurant/qr/advanced/orders/${encodeURIComponent(order.id)}/refund-cash`, {
      method: 'POST', body: JSON.stringify({ amountPaise: Math.round(amount * 100), version: current.version, idempotencyKey: key, reason: reason.trim() })
    });
    await SyncOutboxEngine.catchUpFromCloud().catch(() => undefined);
    return 'Cash refund recorded in the server ledger. Order synchronization requested.';
  }
  const localCash = !qr && ['CASH', 'CASH_AT_COUNTER'].includes(order.paymentMethod ?? '');
  const localUpi = !qr && order.paymentConfirmation?.kind === 'CASHIER_CONFIRMED' && ['UPI', 'UPI_QR'].includes(order.paymentMethod ?? '') && !order.paymentSplits?.length;
  const payment = localCash || localUpi ? undefined : (await getRecentPayments(order.id)).find(row => row.externalOrderId === order.id && row.amount === Math.round(order.totalAmount * 100) && ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(row.status));
  if (payment) {
    const result = await createRefund(payment.id, Math.round(amount * 100), reason.trim(), actor, method, key);
    await SyncOutboxEngine.catchUpFromCloud().catch(() => undefined);
    return result.status === 'SUCCESS' ? 'Returned payment recorded in the server ledger. Order synchronization requested.' : 'Refund recorded; confirmation is pending. Check the payment ledger before returning any more money.';
  }
  if (qr || (!localCash && !localUpi)) throw new Error('No refundable online payment was found. Use the payment ledger to reconcile this bill; its status has not changed.');
  if ((localCash && method !== 'CASH') || (localUpi && method !== 'UPI_TO_CUSTOMER')) throw new Error('Return this local payment using its original tender. A different return method requires payment-ledger reconciliation.');
  const originalOpen = order.shiftId && db.shifts.some(shift => shift.id === order.shiftId && shift.status === 'OPEN');
  if (!originalOpen && !payingShiftId) throw new Error('Choose the open register recording this return.');
  const refunded = OrderRepository.refundOrder(order.id, amount, reason.trim(), actor, payingShiftId ? { idempotencyKey: key, payingShiftId, method } : undefined);
  if (!refunded) throw new Error('Bill unavailable. Refresh before retrying.');
  // The return belongs to its paying till; admin edits must push that till and
  // its cash-out record rather than relying on the counter to publish them.
  await syncShifts({push:true}).catch(() => undefined);
  return payingShiftId ? 'Return recorded in the selected open register. The original closed till remains unchanged. Saved locally for synchronization.' : 'Returned payment recorded against the original register. Saved locally for synchronization.';
}

export async function voidBillingOrder(order: Order, reason: string): Promise<void> {
  const actor = managerName();
  if (!reason.trim()) throw new Error('Enter a cancellation reason.');
  if (['SUCCESS', 'REFUNDED', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus) || (order.paymentAllocationSummary?.collectedPaise ?? 0) > 0) throw new Error('This bill has a recorded collection. Reconcile or refund the payment instead of voiding it.');
  if (getOrderSource(order) === 'QR_TABLE') {
    const current = (await QrAdminApi.orders(db.outlet.id)).find(row => row.id === order.id);
    if (!current) throw new Error('QR bill unavailable in this branch. Refresh before retrying.');
    await QrAdminApi.orderAction(order.id, 'CANCELLED', current.version, reason.trim());
    await SyncOutboxEngine.catchUpFromCloud().catch(() => undefined);
  } else {
    const result = OrderRepository.voidOrder(order.id, reason.trim(), actor);
    if (!result) throw new Error('Bill unavailable. Refresh before retrying.');
  }
}
