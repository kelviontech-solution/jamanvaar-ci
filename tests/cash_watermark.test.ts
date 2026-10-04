import { describe, it, expect } from 'vitest';
import { cashWatermarkFor, paymentLabelFor } from '../packages/ui/src/ThermalReceiptView';

describe('cash bill watermark', () => {
  it('is off by default, and appears on cash bills only when the restaurant turns it on', () => {
    expect(cashWatermarkFor({ paymentMethod: 'CASH_AT_COUNTER' })).toBeNull();
    expect(cashWatermarkFor({ paymentMethod: 'CASH_AT_COUNTER' }, { showCashWatermark: true })).toBe('CASH');
    expect(cashWatermarkFor({ paymentMethod: 'CASH' }, { showCashWatermark: true })).toBe('CASH');
    expect(cashWatermarkFor({ paymentMethod: 'UPI_QR' })).toBeNull();
    expect(cashWatermarkFor({ paymentMethod: 'CARD_TERMINAL' })).toBeNull();
  });
  it('can be switched off, and the word can be changed (trimmed, upper case, short)', () => {
    expect(cashWatermarkFor({ paymentMethod: 'CASH' }, { showCashWatermark: false })).toBeNull();
    expect(cashWatermarkFor({ paymentMethod: 'CASH' }, { showCashWatermark: true, cashWatermarkText: ' paid cash  ' })).toBe('PAID CASH');
    expect(cashWatermarkFor({ paymentMethod: 'CASH' }, { showCashWatermark: true, cashWatermarkText: ' paid cash  ' })).toBe('PAID CASH');
    expect(cashWatermarkFor({ paymentMethod: 'CASH' }, { showCashWatermark: true, cashWatermarkText: 'ABCDEFGHIJKLMNOP' })).toBe('ABCDEFGHIJKL');
    expect(cashWatermarkFor({ paymentMethod: 'CASH' }, { showCashWatermark: true, cashWatermarkText: '   ' })).toBe('CASH');
  });
  it('shows a plain payment name on the bill, never the internal code', () => {
    expect(paymentLabelFor('CASH_AT_COUNTER')).toBe('CASH');
    expect(paymentLabelFor('UPI_QR')).toBe('UPI');
    expect(paymentLabelFor('CARD_TERMINAL')).toBe('CARD');
    expect(paymentLabelFor('NET_BANKING')).toBe('NET BANKING');
    expect(paymentLabelFor(undefined)).toBe('PAID');
  });
});
