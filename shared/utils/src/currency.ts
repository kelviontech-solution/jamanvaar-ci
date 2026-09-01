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
