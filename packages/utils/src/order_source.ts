import type { Order } from '@jamanvaar/types';

export const ORDER_SOURCE_LABELS = {
  POS: 'POS', KIOSK: 'Kiosk', QR_TABLE: 'QR Table', CAPTAIN: 'Captain', ONLINE: 'Online', OTHER: 'Other'
} as const;

/** Preserve the originating app when another device accepts or settles an order. */
export function getOrderSource(order: Pick<Order, 'source_type' | 'orderType' | 'kioskId' | 'tokenNumber'>): keyof typeof ORDER_SOURCE_LABELS {
  if (order.source_type && order.source_type in ORDER_SOURCE_LABELS) return order.source_type;
  if (order.orderType === 'QR_TABLE') return 'QR_TABLE';
  if (order.kioskId?.startsWith('KIOSK') || /^K-\d+$/i.test(order.tokenNumber || '')) return 'KIOSK';
  return 'POS';
}

export function getBillingTender(method: string | undefined): string {
  const value = (method || '').toUpperCase();
  if (['CASH', 'CASH_AT_COUNTER'].includes(value)) return 'CASH';
  if (['UPI', 'UPI_QR', 'BHARAT_QR'].includes(value)) return 'UPI';
  if (['CARD', 'CARD_TERMINAL', 'POS_CARD'].includes(value)) return 'CARD';
  return value;
}
