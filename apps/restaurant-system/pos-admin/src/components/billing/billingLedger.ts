import type { Order, Restaurant, Outlet } from '@jamanvaar/types';
import { isUnpaidOpenOrder } from '@jamanvaar/database';
import { formatINR, getOrderSource, ORDER_SOURCE_LABELS, toCsvRow } from '@jamanvaar/utils';

export const formatBillingMoney = (amount: number) => formatINR(amount, !Number.isInteger(amount));

export function isSubmittedBillingOrder(order: Order): boolean {
  return order.orderStatus !== 'DRAFT';
}

export function isPendingCollection(order: Order): boolean {
  return isSubmittedBillingOrder(order) && order.orderStatus !== 'CANCELLED' && isUnpaidOpenOrder(order);
}

/** Sum paise so accepted, unpaid orders are visible without inventing a payment. */
export function summarizeBillingLedger(orders: Order[]) {
  let placed = 0, collected = 0, pending = 0, refunds = 0, count = 0, pendingCount = 0;
  for (const order of orders) {
    if (!isSubmittedBillingOrder(order) || order.orderStatus === 'CANCELLED') continue;
    const amount = Math.round(Number(order.totalAmount || 0) * 100);
    count++;
    placed += amount;
    if (isPendingCollection(order)) { pending += amount; pendingCount++; }
    else {
      collected += amount;
      if (order.orderStatus === 'REFUNDED' || order.paymentStatus === 'REFUNDED') {
        refunds += Math.min(amount, Math.max(0, Math.round(Number((order as Order & { refundAmount?: number }).refundAmount ?? order.totalAmount) * 100)));
      }
    }
  }
  return { orderValue: placed / 100, collected: (collected - refunds) / 100, pending: pending / 100,
    refunds: refunds / 100, acceptedCount: count, pendingCount };
}

export function exportBillingCsv(orders: Order[], restaurant: Restaurant | null | undefined, outlet: Outlet | null | undefined, scope: string, filters: string): string {
  const s = summarizeBillingLedger(orders);
  const rows: Array<Array<string | number | undefined>> = [
    ['JAMANVAAR | Billing statement'], ['Restaurant', restaurant?.name], ['Branch', outlet?.name],
    ['Address', outlet?.address || restaurant?.address], ['GSTIN', restaurant?.gstin],
    ['Contact', outlet?.phone || restaurant?.phone], ['Date scope', scope], ['Filters', filters],
    ['Order value', s.orderValue], ['Collected (after refunds)', s.collected], ['Pending collection', s.pending], ['Refunds', s.refunds], [],
    ['Invoice / Order', 'Token', 'Created at', 'Source', 'Type', 'Table', 'Customer', 'Phone', 'Items',
      'Subtotal', 'Discount', 'GST', 'Total', 'Tender', 'Payment status', 'Order status', 'Pending collection', 'Refund amount']
  ];
  for (const o of orders) rows.push([(o as Order & { invoiceNumber?: string }).invoiceNumber || o.orderNumber, o.tokenNumber, o.createdAt,
    ORDER_SOURCE_LABELS[getOrderSource(o)], o.orderType, o.tableNumber, o.customerName || 'Walk-in', o.customerPhone,
    o.items.map(i => `${i.quantity} x ${i.name}`).join('; '), o.subtotal, o.discountAmount || 0, o.taxAmount || 0,
    o.totalAmount, o.paymentMethod, o.paymentStatus, o.orderStatus, isPendingCollection(o) ? o.totalAmount : 0,
    o.orderStatus === 'REFUNDED' || o.paymentStatus === 'REFUNDED' ? ((o as Order & { refundAmount?: number }).refundAmount ?? o.totalAmount) : 0]);
  return '\uFEFF' + rows.map(toCsvRow).join('\r\n');
}
