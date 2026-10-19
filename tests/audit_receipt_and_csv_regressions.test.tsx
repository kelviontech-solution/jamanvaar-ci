import { describe, it, expect, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { db } from '@jamanvaar/database';
import { ThermalReceiptView, receiptPaymentSummary } from '../packages/ui/src/ThermalReceiptView';
import { OrderActivityView } from '../packages/ui/src/OrderActivityView';
import { recordedOrderBalance } from '@jamanvaar/types';
import { orderPaymentPosition } from '@jamanvaar/database';
import { outstandingBillAmount } from '@jamanvaar/utils';
import { previewMenuCsv } from '../packages/business/src/menu_csv';
import { buildReceiptPdfBuffer } from '../cloud/api/src/modules/notifications/receipt-pdf.util';
import type { Order } from '@jamanvaar/types';

describe('Browser audit financial regressions', () => {
  // Deliberately minimal: only the fields these receipt/CSV assertions actually read. Cast through
  // `unknown` (TS's own suggested idiom for an intentional partial fixture) rather than fabricating
  // the other ~17 Order fields, which would just be unused noise unrelated to what's under test.
  const order = {totalAmount: 250, paymentMethod: 'CASH_AT_COUNTER', paymentStatus: 'PENDING', items: [], createdAt: new Date().toISOString()} as unknown as Order;
  beforeEach(() => db.resetToDefaultSeed());
  it('cash tender selection does not claim payment on the customer receipt', () => {
    expect(receiptPaymentSummary(order)).toMatchObject({collected: 0, outstanding: 250, label: 'PAYMENT DUE AT COUNTER'});
    const html = renderToStaticMarkup(<ThermalReceiptView order={order} />);
    expect(html).toContain('PAYMENT DUE AT COUNTER');
    expect(html).not.toContain('PAID VIA:');
    expect(html).toContain('Balance due:');
  });
  it('shows partial collections and only uses paid wording after verified settlement', () => {
    expect(receiptPaymentSummary({...order, paymentAllocationSummary: {collectedPaise: 10000, outstandingPaise: 15000}})).toMatchObject({collected: 100, outstanding: 150});
    expect(receiptPaymentSummary({...order, paymentStatus: 'SUCCESS'})).toMatchObject({collected: 250, outstanding: 0, label: 'PAID VIA'});
  });
  it.each([
    { orderStatus: 'CANCELLED', paymentStatus: 'CANCELLED', collected: 0, outstanding: 0, refunded: 0 },
    { orderStatus: 'PREPARING', paymentStatus: 'PENDING', collected: 0, outstanding: 250, refunded: 0 },
    { orderStatus: 'PREPARING', paymentStatus: 'CANCELLED', collected: 0, outstanding: 250, refunded: 0 },
    { orderStatus: 'COMPLETED', paymentStatus: 'SUCCESS', collected: 250, outstanding: 0, refunded: 0 },
    { orderStatus: 'REFUNDED', paymentStatus: 'REFUNDED', collected: 250, outstanding: 0, refunded: 250 },
    { orderStatus: 'COMPLETED', paymentStatus: 'SUCCESS', refundAmount: 50, collected: 250, outstanding: 0, refunded: 50 }
  ])('receipt, activity and reporting share recorded balances for $orderStatus/$paymentStatus', row => {
    const record = { ...order, ...row } as Order;
    const summary = receiptPaymentSummary(record), balance = recordedOrderBalance(record), report = orderPaymentPosition(record);
    expect(summary).toMatchObject({ collected: row.collected, outstanding: row.outstanding, refunded: row.refunded });
    expect(report).toMatchObject(balance);
    expect(outstandingBillAmount(record)).toBe(row.outstanding);
    const html = renderToStaticMarkup(<OrderActivityView order={record}/>);
    if (row.orderStatus === 'CANCELLED') { expect(html).toContain('Balance due'); expect(html).not.toContain('₹250'); }
    if (row.refunded) expect(html).toContain('Refunded');
  });
  it('recognizes GST rate and warns about unknown CSV columns before import', () => {
    const preview = previewMenuCsv('name,category,price,gst_rate,misspelled_column\nTea,Beverages,100,5,test');
    expect(preview.errors).toEqual([]);
    expect(preview.rows[0].taxRate).toBe(5);
    expect(preview.warnings.some(w => w.message.includes('misspelledcolumn'))).toBe(true);
  });
  it('generates a pending invoice using actual packaged PDFKit standard fonts', async () => {
    const pdf = await buildReceiptPdfBuffer({restaurantName:'Audit Restaurant', legalName:null, gstin:null, fssaiNumber:null, address:null, externalOrderId:'pending-250', paidAt:null, method:'CASH_AT_COUNTER', lines:[{name:'Lunch',quantity:1,unitPrice:25000,lineTotal:25000}], subtotal:25000, taxAmount:0,totalAmount:25000, collectedAmount:0,outstandingAmount:25000});
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
