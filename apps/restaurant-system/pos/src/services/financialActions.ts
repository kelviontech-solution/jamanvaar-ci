import { db, financialRequestFingerprint, OrderRepository } from '@jamanvaar/database';

/** Local return bookkeeping, never an instruction to a payment gateway to move money. */
export async function commitOrderReturn(request: {
  kind: 'REFUND' | 'VOID'; orderId: string; amount?: number; reason: string; actor: string;
  expectedRefundBefore?: number;
  returnOptions?: { idempotencyKey: string; payingShiftId: string; method: 'CASH' | 'UPI_TO_CUSTOMER' };
}) {
  const frozen = { ...structuredClone(request), reason: request.reason.trim(), actor: request.actor.trim() };
  const fingerprint = await financialRequestFingerprint(JSON.stringify({ operation: 'POS_RETURN_V1',
    restaurant: db.restaurant.id, branch: db.outlet.id, ...frozen }));
  const outcome = await db.commitFinancialMutation(fingerprint, () => {
    const current = OrderRepository.getOrderById(frozen.orderId);
    const previous = frozen.returnOptions && current?.refundEvents?.find(event => event.idempotencyKey === frozen.returnOptions!.idempotencyKey);
    if (!previous && frozen.expectedRefundBefore !== undefined && (current?.refundAmount ?? 0) !== frozen.expectedRefundBefore) {
      throw new Error('The refund ledger changed. Reconcile the original return reference before recording anything else; do not pay the guest again.');
    }
    const order = frozen.kind === 'REFUND'
      ? OrderRepository.refundOrder(frozen.orderId, frozen.amount ?? NaN, frozen.reason, frozen.actor, frozen.returnOptions)
      : OrderRepository.voidOrder(frozen.orderId, frozen.reason, frozen.actor);
    if (!order) throw new Error('The original bill is unavailable. Review it before recording a return.');
    return { orderId: order.id };
  });
  const order = OrderRepository.getOrderById(outcome.result.orderId);
  if (!order) throw new Error('Return saved; the original bill needs recovery. Do not refund twice.');
  return { ...outcome, order };
}

/** Called only after the authenticated server status endpoint confirms the original collection. */
export async function commitVerifiedOnlineCollection(orderId: string, paymentId: string) {
  const saved = await db.commitFinancialMutation(await financialRequestFingerprint(JSON.stringify({ operation: 'POS_VERIFIED_COLLECTION_V1',
    restaurant: db.restaurant.id, branch: db.outlet.id, orderId, paymentId })), () => {
    const original = OrderRepository.getOrderById(orderId);
    if (!original || !paymentId.trim()) throw new Error('The original bill or payment reference is unavailable. Do not collect again.');
    if (['CANCELLED', 'REFUNDED'].includes(original.orderStatus) || original.paymentStatus === 'REFUNDED') throw new Error('Payment was verified for a closed bill. Reconcile its original reference before taking any action.');
    if (original.paymentTransactionId && original.paymentTransactionId !== paymentId) throw new Error('This bill has a different collection reference. Reconcile it before taking any action.');
    const result = original.paymentStatus === 'SUCCESS' ? original
      : OrderRepository.settleOrder(orderId, 'UPI', undefined, paymentId, 'Server-verified UPI (reconciled at counter)');
    if (!result) throw new Error('The original bill needs recovery. Do not collect again.');
    return { orderId: result.id };
  });
  const order = OrderRepository.getOrderById(saved.result.orderId);
  if (!order) throw new Error('Collection saved; its bill needs recovery. Do not collect again.');
  return { ...saved, order };
}
