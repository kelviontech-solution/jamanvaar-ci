import { KOTRepository, OrderRepository } from '@jamanvaar/database';

/** Resetting a shared terminal abandons a checkout, never an admitted kitchen order. */
export function cancelAbandonedKioskDraft(orderId: string | null): void {
  if (!orderId) return;
  const order = OrderRepository.getOrderById(orderId);
  if (order?.orderStatus !== 'DRAFT' || order.paymentStatus !== 'PENDING') return;
  if (KOTRepository.getKOTsForOrder(orderId).length) return;
  OrderRepository.updateOrderStatus(orderId, 'CANCELLED', 'Guest left the kiosk before submitting the order');
}

/** Cash stays unpaid until the cashier collects it; confirmation hands it to the kitchen. */
export function confirmKioskCashOrder(orderId: string) {
  const order = OrderRepository.getOrderById(orderId);
  if (!order || order.orderStatus !== 'DRAFT' || order.paymentStatus !== 'PENDING') return null;
  OrderRepository.choosePaymentMethod(orderId, 'CASH_AT_COUNTER');
  return OrderRepository.updateOrder(orderId, { orderStatus: 'CONFIRMED' });
}
