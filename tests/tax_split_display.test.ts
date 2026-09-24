import { describe, it, expect } from 'vitest';
import { formatSplitTax, splitTax, formatINR } from '@jamanvaar/utils';

/**
 * B2-036: a stored cgstAmount/sgstAmount pair (5.5 + 5.5 = 11, exactly the order's real
 * taxAmount) is individually correct, but formatINR's whole-rupee display rounds each half
 * independently (Math.round(5.5) = 6), so a document could show "CGST 6 + SGST 6 = 12" right
 * next to a total built from the un-rounded 220 + 11 = 231 — a visible contradiction, and a
 * different one on every screen that displayed the split its own way (receipt, invoice, dialog,
 * report). formatSplitTax is the one place every such screen should get its displayed CGST/SGST
 * strings from.
 */
describe('B2-036: formatSplitTax keeps displayed CGST + SGST always equal to the displayed tax total', () => {
  it('reproduces the exact live-confirmed bug figures and shows they now sum correctly', () => {
    // ₹220 subtotal, 5% GST -> 5.5 + 5.5 = 11 exactly. Naive independent rounding: 6 + 6 = 12.
    const { cgst, sgst } = formatSplitTax(11, 5.5, 5.5);
    expect(cgst).toBe('₹6');
    expect(sgst).toBe('₹5');
    // The two displayed halves now add up to the displayed total, unlike the old 6+6=12 bug.
    const cgstNum = Number(cgst.replace('₹', ''));
    const sgstNum = Number(sgst.replace('₹', ''));
    expect(cgstNum + sgstNum).toBe(11);
    expect(formatINR(11)).toBe('₹11');
  });

  it('still agrees with formatINR for a tax total that splits evenly', () => {
    const { cgst, sgst } = formatSplitTax(20, 10, 10);
    expect(cgst).toBe('₹10');
    expect(sgst).toBe('₹10');
  });

  it('falls back to summing the given cgst/sgst when no explicit tax total is passed', () => {
    const { cgst, sgst } = formatSplitTax(0, 5.5, 5.5);
    expect(cgst).toBe('₹6');
    expect(sgst).toBe('₹5');
  });

  it('the underlying splitTax(total, 0) always sums back to the rounded whole-rupee total, for any total', () => {
    for (let total = 0; total <= 50; total++) {
      const { cgst, sgst } = splitTax(total, 0);
      expect(cgst + sgst).toBe(total);
    }
  });
});
