import { db, orderPaymentPosition } from '@jamanvaar/database';
import { usePosStore, isManagerOrAboveRole } from '../store/posStore';
import { PosRecoveryService } from './recoveryService';

export interface InterruptedOperationReview {
  operationId: string;
  orderId: string;
  orderNumber: string;
  paymentStatus: string;
  orderStatus: string;
  totalAmount: number;
  collectedAmount: number;
  refundedAmount: number;
  outstandingAmount: number;
  cartItems: number;
  savedDraftItems: number;
}
let reviewed: { summary: InterruptedOperationReview; userId: string; cart: string; order: string } | null = null;
function draftState() {
  const state = usePosStore.getState();
  return { cart: state.cart, recoverableDraft: state.recoverableDraft, storedDraft: PosRecoveryService.loadDraft() };
}
function requireManager(): string {
  const state = usePosStore.getState();
  const user = db.users.find(user => user.id === state.currentUser?.id && user.isActive);
  if (!state.isAuthenticated || !user || user.roleId !== state.currentUser?.roleId || !isManagerOrAboveRole(user)) {
    throw Error('An active manager must sign in on this terminal to review an interrupted operation.');
  }
  return user.id;
}

/** Restores the original local save. This does not request payment, print or pulse a drawer. */
export async function reviewInterruptedOperation(operationId: string): Promise<InterruptedOperationReview> {
  const userId = requireManager();
  const draft = draftState();
  const cart = JSON.stringify(draft);
  const saved = await db.recoverPendingFinancialMutation(operationId);
  if (requireManager() !== userId) throw Error('The signed-in manager changed. Review this operation again.');
  const order = db.orders.find(order => order.id === saved.result.orderId);
  if (!order) throw Error('The original bill is unavailable. Keep this operation for support; do not collect payment again.');
  const balance = orderPaymentPosition(order);
  const summary = { operationId: saved.operationId, orderId: order.id, orderNumber: order.orderNumber,
    paymentStatus: order.paymentStatus, orderStatus: order.orderStatus, totalAmount: order.totalAmount,
    collectedAmount: balance.collectedPaise / 100, refundedAmount: balance.refundedPaise / 100, outstandingAmount: balance.outstandingPaise / 100,
    cartItems: draft.cart.items.reduce((sum, line) => sum + line.quantity, 0),
    savedDraftItems: Math.max(draft.recoverableDraft?.cart.items.reduce((sum, line) => sum + line.quantity, 0) ?? 0,
      draft.storedDraft?.cart.items.reduce((sum, line) => sum + line.quantity, 0) ?? 0) };
  reviewed = { summary, userId, cart, order: JSON.stringify(order) };
  return summary;
}

/** A human review distinguishes an interrupted draft from new work; neither is silently discarded. */
export async function finishInterruptedOperation(operationId: string, draft: 'RECOVERED_BILL' | 'SEPARATE_WORK' | 'EMPTY'): Promise<void> {
  const userId = requireManager();
  const review = reviewed;
  if (!review || review.userId !== userId || review.summary.operationId !== operationId) throw Error('Restore and review the original bill before finishing recovery.');
  const pending = db.getPendingFinancialRecovery();
  // Replaying after a lost final acknowledgement may prove that SQLite already
  // removed this intent. The reviewed original result remains adoptable then;
  // a different pending operation must never be acknowledged in its place.
  if (pending && (pending.operationId !== operationId || pending.orderId !== review.summary.orderId)) throw Error('The pending operation changed. Review it again.');
  const state = usePosStore.getState();
  const order = db.orders.find(order => order.id === review.summary.orderId);
  const currentDraft = draftState();
  if (!order || JSON.stringify(order) !== review.order || JSON.stringify(currentDraft) !== review.cart) throw Error('The bill or cart changed during review. Restore and review it again; your work was kept.');
  const hasDraft = currentDraft.cart.items.length || currentDraft.recoverableDraft?.cart.items.length || currentDraft.storedDraft?.cart.items.length;
  if (!['RECOVERED_BILL', 'SEPARATE_WORK', 'EMPTY'].includes(draft) || (hasDraft && draft === 'EMPTY')) throw Error('Identify whether the current cart and saved draft belong to the recovered bill or are separate work.');
  if (draft === 'RECOVERED_BILL') {
    state.clearCart();
    usePosStore.setState({ selectedTable: null, selectedCustomer: null, recoverableDraft: null });
    if (PosRecoveryService.loadDraft()) throw Error('The old draft could not be cleared on this device. Recovery stays open; do not collect again.');
  }
  // No receipt auto-print, drawer, payment request or new order is dispatched.
  usePosStore.setState({ isPaymentOpen: false, isReceiptOpen: false, lastCompletedOrder: order });
  await db.acknowledgeFinancialMutation(operationId);
  reviewed = null;
}
