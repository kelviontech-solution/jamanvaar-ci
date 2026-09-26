import { describe, it, expect } from 'vitest';
import { cashWatermarkFor } from '../packages/ui/src/ThermalReceiptView';

describe('cash bill watermark', () => {
  it('is on for cash bills by default, off for card and UPI', () => {
    expect(cashWatermarkFor({ paymentMethod: 'CASH_AT_COUNTER' })).toBe('CASH');
    expect(cashWatermarkFor({ paymentMethod: 'CASH' })).toBe('CASH');
    expect(cashWatermarkFor({ paymentMethod: 'UPI_QR' })).toBeNull();
    expect(cashWatermarkFor({ paymentMethod: 'CARD_TERMINAL' })).toBeNull();
  });
  it('can be switched off, and the word can be changed (trimmed, upper case, short)', () => {
    expect(cashWatermarkFor({ paymentMethod: 'CASH' }, { showCashWatermark: false })).toBeNull();
    expect(cashWatermarkFor({ paymentMethod: 'CASH' }, { cashWatermarkText: ' paid cash  ' })).toBe('PAID CASH');
    expect(cashWatermarkFor({ paymentMethod: 'CASH' }, { cashWatermarkText: 'ABCDEFGHIJKLMNOP' })).toBe('ABCDEFGHIJKL');
    expect(cashWatermarkFor({ paymentMethod: 'CASH' }, { cashWatermarkText: '   ' })).toBe('CASH');
  });
});
