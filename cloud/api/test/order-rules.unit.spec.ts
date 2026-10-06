import { describe, it, expect } from 'vitest';
import { decideStatus, integrityFlags, statusRank } from '../src/modules/order-sync/order-rules';

describe('order status rules', () => {
  it('moves forward freely and repeats harmlessly', () => {
    expect(decideStatus('NEW', 'PREPARING', 'KDS')).toEqual({ apply: true, status: 'PREPARING' });
    expect(decideStatus('PREPARING', 'READY', 'KDS')).toEqual({ apply: true, status: 'READY' });
    expect(decideStatus('READY', 'READY', 'POS')).toEqual({ apply: true, status: 'READY' });
    expect(decideStatus(undefined, 'NEW', 'KIOSK')).toEqual({ apply: true, status: 'NEW' });
    expect(decideStatus('READY', 'CANCELLED', 'POS')).toEqual({ apply: true, status: 'CANCELLED' });
  });
  it('never goes backwards unless a counter device deliberately corrects', () => {
    expect(decideStatus('READY', 'PREPARING', 'KDS')).toMatchObject({ apply: false, status: 'READY', reason: 'STATUS_REGRESSION' });
    expect(decideStatus('COMPLETED', 'NEW', 'CAPTAIN')).toMatchObject({ apply: false, reason: 'STATUS_REGRESSION' });
    expect(decideStatus('COMPLETED', 'PREPARING', 'POS', { statusCorrection: true })).toEqual({ apply: true, status: 'PREPARING' });
    expect(decideStatus('COMPLETED', 'PREPARING', 'KDS', { statusCorrection: true })).toMatchObject({ apply: false }); // no authority
  });
  it('a cancelled or refunded order stays so (a paid order can still be refunded)', () => {
    expect(decideStatus('CANCELLED', 'PREPARING', 'POS')).toMatchObject({ apply: false, reason: 'STATUS_TERMINAL' });
    expect(decideStatus('REFUNDED', 'COMPLETED', 'POS')).toMatchObject({ apply: false });
    expect(decideStatus('COMPLETED', 'REFUNDED', 'POS')).toEqual({ apply: true, status: 'REFUNDED' });
  });
  it('a kiosk cannot run the kitchen or the counter on an existing order', () => {
    expect(decideStatus('NEW', 'READY', 'KIOSK')).toMatchObject({ apply: false, reason: 'STATUS_NOT_PERMITTED' });
    expect(decideStatus('NEW', 'COMPLETED', 'KIOSK_ADMIN')).toMatchObject({ apply: false });
    expect(decideStatus('NEW', 'PREPARING', 'KIOSK')).toEqual({ apply: true, status: 'PREPARING' });
  });
  it('an unknown status is never blocked (the server does not guess)', () => {
    expect(decideStatus('READY', 'SOMETHING_NEW', 'POS')).toEqual({ apply: true, status: 'SOMETHING_NEW' });
    expect(statusRank('bogus')).toBeUndefined();
  });
});

describe('device-priced order integrity flags', () => {
  const line = (id: string, q: number, u: number, t = q * u) => ({ externalItemId: id, quantity: q, unitPrice: u, lineTotal: t });
  it('a consistent order has no flags', () => {
    expect(integrityFlags([line('a', 2, 500)], 1000, new Map([['a', 500]]))).toEqual([]);
  });
  it('uses net subtotal for an inclusive-tax line and still flags a wrong subtotal', () => {
    const inclusive = { ...line('line-a', 1, 11800), snapshot: { taxInclusive: true, lineTax: 1800 } };
    expect(integrityFlags([inclusive, line('zero-tax', 1, 29900)], 39900, new Map())).toEqual([]);
    expect(integrityFlags([inclusive], 11800, new Map())).toEqual(['SUBTOTAL_MISMATCH:10000!=11800']);
    expect(integrityFlags([{ ...inclusive, snapshot: { taxInclusive: true, lineTax: -1800 } }], 10000, new Map())).toEqual(['SUBTOTAL_MISMATCH:11800!=10000']);
  });
  it('looks up a menu item independently of its unique order-line ID', () => {
    const priced = { ...line('unique-line', 1, 300), menuItemId: 'dish-a' };
    expect(integrityFlags([priced], 300, new Map([['dish-a', 500]]))).toEqual(['BELOW_MENU_PRICE:unique-line:300<500']);
  });
  it('flags a wrong line total, a wrong subtotal and a price below the menu price', () => {
    expect(integrityFlags([line('a', 2, 500, 900)], 900, new Map())).toEqual(['LINE_TOTAL_MISMATCH:a']);
    expect(integrityFlags([line('a', 1, 500)], 600, new Map())).toEqual(['SUBTOTAL_MISMATCH:500!=600']);
    expect(integrityFlags([line('a', 1, 300)], 300, new Map([['a', 500]]))[0]).toBe('BELOW_MENU_PRICE:a:300<500');
    expect(integrityFlags([line('a', 1, 700)], 700, new Map([['a', 500]]))).toEqual([]); // modifiers may add to the base price
  });
});
