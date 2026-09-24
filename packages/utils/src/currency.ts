/**
 * Currency and Financial Math Utilities for JAMANVAAR
 */

export function formatINR(amount: number, showDecimals: boolean = false): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return '₹0';
  }

  const rounded = showDecimals ? amount.toFixed(2) : Math.round(amount).toString();
  return `₹${rounded}`;
}

export function roundToTwoDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateRoundOff(exactTotal: number): { roundedTotal: number; roundOff: number } {
  const roundedTotal = Math.round(exactTotal);
  const roundOff = roundToTwoDecimals(roundedTotal - exactTotal);
  return { roundedTotal, roundOff };
}

/**
 * Splits a bill's total GST into CGST and SGST so the two ALWAYS add up to the total (BUG-039).
 * When the total cannot be halved exactly, CGST takes the extra unit (41 + 40 for 81). Screens used
 * to halve the tax on their own and disagreed with each other by a rupee or a paisa.
 * `decimals` is 2 for rupees and paise, 0 for whole-rupee report summaries.
 */
export function splitTax(totalTax: number, decimals: 0 | 2 = 2): { cgst: number; sgst: number } {
  const factor = decimals === 0 ? 1 : 100;
  const units = Math.round((Number(totalTax) || 0) * factor);
  const cgstUnits = Math.ceil(units / 2);
  return { cgst: cgstUnits / factor, sgst: (units - cgstUnits) / factor };
}

/** The same split for an amount already in integer paise (the cloud order sync). */
export function splitTaxPaise(totalTaxPaise: number): { cgst: number; sgst: number } {
  const total = Math.round(Number(totalTaxPaise) || 0);
  const cgst = Math.ceil(total / 2);
  return { cgst, sgst: total - cgst };
}

/**
 * B2-036: a stored `cgstAmount`/`sgstAmount` pair (e.g. 5.5 + 5.5, exactly the order's real
 * `taxAmount` of 11) is individually correct, but `formatINR`'s whole-rupee display rounds each
 * one *independently* (`Math.round(5.5)` = 6), so a receipt/invoice/dialog/report showing both
 * halves could print "CGST 6 + SGST 6" next to a total built from the un-rounded 220 + 11 = 231
 * — a visible contradiction on the same document, and a different one on every screen that
 * displays the split its own way. This is the one place every such screen should get its
 * displayed CGST/SGST strings from: both numbers are always guaranteed to add up to the
 * whole-rupee tax actually charged, because they're derived from splitting the *already-rounded*
 * total (`splitTax(total, 0)`) instead of rounding two already-fractional halves separately.
 */
export function formatSplitTax(taxAmount: number, cgstAmount?: number, sgstAmount?: number): { cgst: string; sgst: string } {
  const total = Number(taxAmount) || (Number(cgstAmount) || 0) + (Number(sgstAmount) || 0);
  const { cgst, sgst } = splitTax(total, 0);
  return { cgst: formatINR(cgst), sgst: formatINR(sgst) };
}

/** Centred restaurant name for the top of a printed slip; empty when the restaurant has not set a name. */
export function slipHeader(restaurantName: string | undefined | null, width = 40): string {
  const name = (restaurantName || '').trim().toUpperCase().slice(0, width);
  if (!name) return '';
  return ' '.repeat(Math.max(0, Math.floor((width - name.length) / 2))) + name;
}
