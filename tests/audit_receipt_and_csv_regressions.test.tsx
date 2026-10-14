import { describe, it, expect, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { db } from '@jamanvaar/database';
import { ThermalReceiptView, receiptPaymentSummary } from '../packages/ui/src/ThermalReceiptView';
import { previewMenuCsv } from '../packages/business/src/menu_csv';
import { buildReceiptPdfBuffer } from '../cloud/api/src/modules/notifications/receipt-pdf.util';
import type { Order } from '@jamanvaar/types';

describe('Browser audit financial regressions', () => {
  const order = {totalAmount: 250, paymentMethod: 'CASH_AT_COUNTER', paymentStatus: 'PENDING', items: [], createdAt: new Date().toISOString()} as Order;
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
