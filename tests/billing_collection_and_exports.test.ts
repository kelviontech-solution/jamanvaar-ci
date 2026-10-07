import { describe, it, expect } from 'vitest';
import type { Order, Restaurant } from '@jamanvaar/types';
import { getOrderSource, getBillingTender } from '@jamanvaar/utils';
import { exportBillingCsv, summarizeBillingLedger } from '../apps/restaurant-system/pos-admin/src/components/billing/billingLedger';

const order = (changes: Partial<Order> & { refundAmount?: number } = {}): Order => ({
  id: 'bill', orderNumber: 'INV-1', tokenNumber: 'K-1', kioskId: 'uuid-device', orderType: 'TAKEAWAY',
  items: [{ id: 'line', name: 'Coffee', quantity: 1, unitPrice: 250, totalPrice: 250 }] as Order['items'],
  createdAt: '2026-10-07T06:00:00Z', totalAmount: 250, subtotal: 250, taxAmount: 0,
  paymentMethod: 'CASH_AT_COUNTER', paymentStatus: 'PENDING', orderStatus: 'CONFIRMED', source_type: 'KIOSK', ...changes
} as Order);

describe('Billing collection and filtered exports', () => {
  it('shows 5116 collected + 250 pending = 5366 order value without inventing cash', () => {
    const baseline = order({ totalAmount: 5116, paymentMethod: 'CASH', paymentStatus: 'SUCCESS', orderStatus: 'COMPLETED', source_type: 'POS' });
    const kiosk = order();
    expect(summarizeBillingLedger([baseline, kiosk])).toMatchObject({ orderValue: 5366, collected: 5116, pending: 250, pendingCount: 1 });
    expect(summarizeBillingLedger([baseline, { ...kiosk, paymentStatus: 'SUCCESS', orderStatus: 'COMPLETED' }])).toMatchObject({ orderValue: 5366, collected: 5366, pending: 0, pendingCount: 0 });
  });
  it('excludes abandoned drafts and cancelled orders, while a served but unpaid order stays pending', () => {
    expect(summarizeBillingLedger([order({ orderStatus: 'DRAFT' }), order({ orderStatus: 'CANCELLED' }), order({ orderStatus: 'READY' })])).toMatchObject({ orderValue: 250, collected: 0, pending: 250, acceptedCount: 1 });
  });
  it('keeps paise exact and subtracts a partial refund only once', () => {
    const result = summarizeBillingLedger([order({ totalAmount: 10.10 }), order({ totalAmount: 20.20 }),
      order({ totalAmount: 100.55, paymentStatus: 'REFUNDED', orderStatus: 'REFUNDED', refundAmount: 30.25 })]);
    expect(result).toMatchObject({ orderValue: 130.85, pending: 30.30, collected: 70.30, refunds: 30.25 });
  });
  it('normalizes cash/UPI/card aliases and preserves the originating app after POS settlement', () => {
    expect(getBillingTender('CASH_AT_COUNTER')).toBe(getBillingTender('CASH'));
    expect(getBillingTender('UPI_QR')).toBe(getBillingTender('UPI'));
    expect(getBillingTender('CARD_TERMINAL')).toBe(getBillingTender('CARD'));
    expect(getOrderSource(order({ paymentMethod: 'CASH', orderStatus: 'COMPLETED' }))).toBe('KIOSK');
    expect(getOrderSource(order({ source_type: undefined }))).toBe('KIOSK');
    expect(getOrderSource(order({ source_type: 'CAPTAIN' }))).toBe('CAPTAIN');
  });
  it('exports precisely the filtered rows with restaurant identity, source, payment state and safe spreadsheet fields', () => {
    const restaurant = { name: 'My Dining', address: 'Ahmedabad', gstin: '24GSTIN', phone: '1234567890' } as Restaurant;
    const csv = exportBillingCsv([order({ customerName: '=HYPERLINK("bad")' })], restaurant, undefined, 'Today', 'Kiosk orders');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Restaurant,My Dining');
    expect(csv).toContain('GSTIN,24GSTIN');
    expect(csv).toContain('Filters,Kiosk orders');
    expect(csv).toContain('Order value,250');
    expect(csv).toContain('Pending collection,250');
    expect(csv).toContain('Source,Type');
    expect(csv).toContain('Kiosk,TAKEAWAY');
    expect(csv).toContain('CASH_AT_COUNTER,PENDING,CONFIRMED,250,0');
    expect(csv).toContain("'=HYPERLINK");
    expect(csv.split('\r\n').filter(row => row.startsWith('INV-1,'))).toHaveLength(1);
  });
});
