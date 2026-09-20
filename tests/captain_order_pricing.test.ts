import { describe, it, expect } from 'vitest';
import { calculateCart, priceOrderLines } from '@jamanvaar/business';
import type { CartItem } from '@jamanvaar/types';

/**
 * BUG-102: Captain used a flat `subtotal * 0.05` and never set CGST/SGST/round-off, so its bills
 * disagreed with POS and the POS receipt for a Captain order printed CGST ₹0 / SGST ₹0 above a
 * total that did not match. Captain now prices with the same rules POS uses.
 */
describe('Captain order pricing (BUG-102)', () => {
  it('splits the tax into CGST and SGST that add up to the tax', () => {
    const p = priceOrderLines([{ unitPrice: 280, quantity: 1 }, { unitPrice: 290, quantity: 2 }]);
    expect(p).toEqual({ subtotal: 860, cgstAmount: 21.5, sgstAmount: 21.5, taxAmount: 43, roundOffAmount: 0, totalAmount: 903 });
  });

  it('rounds the bill to a whole rupee and reports the round-off, as POS does', () => {
    const p = priceOrderLines([{ unitPrice: 55, quantity: 1 }]);
    expect(p.subtotal).toBe(55);
    expect(p.cgstAmount + p.sgstAmount).toBeCloseTo(p.taxAmount, 2);
    expect(p.totalAmount).toBe(58);
    expect(p.roundOffAmount).toBeCloseTo(58 - (55 + p.taxAmount), 2);
  });

  it('gives exactly the same bill as the POS cart calculation for the same dishes', () => {
    const lines = [{ unitPrice: 135, quantity: 3 }, { unitPrice: 49.5, quantity: 2 }, { unitPrice: 210, quantity: 1 }];
    const cart = calculateCart({
      items: lines.map((l) => ({ item: { price: l.unitPrice }, quantity: l.quantity, selectedModifiers: [] }) as unknown as CartItem)
    });
    const p = priceOrderLines(lines);
    expect(p.subtotal).toBe(cart.subtotal);
    expect(p.taxAmount).toBe(cart.taxAmount);
    expect(p.totalAmount).toBe(cart.totalPayable);
    expect(p.roundOffAmount).toBe(cart.roundOffAmount);
  });

  it('an empty order costs nothing', () => {
    expect(priceOrderLines([])).toEqual({ subtotal: 0, cgstAmount: 0, sgstAmount: 0, taxAmount: 0, roundOffAmount: 0, totalAmount: 0 });
  });
});
