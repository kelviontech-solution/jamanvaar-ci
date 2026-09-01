import { Cart, CartItem, Coupon, MenuItem, SelectedModifier } from '@jamanvaar/types';
import { calculateRoundOff, roundToTwoDecimals } from '@jamanvaar/utils';
import { APP_CONSTANTS } from '@jamanvaar/config';

/**
 * Calculates total unit price for an item with its selected modifiers
 */
export function calculateItemUnitPrice(basePrice: number, modifiers: SelectedModifier[] = []): number {
  const modifierSum = modifiers.reduce((acc, mod) => acc + (mod.priceDelta || 0), 0);
  return roundToTwoDecimals(basePrice + modifierSum);
}

/**
 * Calculates complete item total including quantity
 */
export function calculateItemTotal(basePrice: number, quantity: number, modifiers: SelectedModifier[] = []): number {
  const unitPrice = calculateItemUnitPrice(basePrice, modifiers);
  return roundToTwoDecimals(unitPrice * quantity);
}

export interface CalculateCartOptions {
  items: CartItem[];
  coupon?: Coupon | null;
  cgstPercent?: number;
  sgstPercent?: number;
  serviceChargePercent?: number;
  tipAmount?: number;
}

/**
 * Calculates comprehensive cart financial breakdown:
 * - Subtotal
 * - Coupon discount
 * - CGST & SGST (GST 5% standard)
 * - Service charge / tips
 * - Round off
 * - Total Payable
 */
export function calculateCart(options: CalculateCartOptions): Cart {
  const {
    items,
    coupon = null,
    cgstPercent = APP_CONSTANTS.DEFAULT_CGST_PERCENT,
    sgstPercent = APP_CONSTANTS.DEFAULT_SGST_PERCENT,
    serviceChargePercent = 0,
    tipAmount = 0
  } = options;

  // 1. Calculate raw Subtotal from all item lines
  const subtotal = roundToTwoDecimals(
    items.reduce((acc, it) => acc + (it.itemTotal || calculateItemTotal(it.item.price, it.quantity, it.selectedModifiers)), 0)
  );

  // 2. Evaluate Coupon Discount
  let discountAmount = 0;
  if (coupon && coupon.isActive) {
    if (subtotal >= coupon.minOrderValue) {
      if (coupon.discountType === 'PERCENTAGE') {
        const rawDiscount = (subtotal * coupon.discountValue) / 100;
        discountAmount = coupon.maxDiscountAmount
          ? Math.min(rawDiscount, coupon.maxDiscountAmount)
          : rawDiscount;
      } else {
        discountAmount = Math.min(coupon.discountValue, subtotal);
      }
      discountAmount = roundToTwoDecimals(discountAmount);
    }
  }

  const taxableAmount = Math.max(0, subtotal - discountAmount);

  // 3. Tax calculations (CGST + SGST on taxable amount)
  const cgstAmount = roundToTwoDecimals((taxableAmount * cgstPercent) / 100);
  const sgstAmount = roundToTwoDecimals((taxableAmount * sgstPercent) / 100);
  const taxAmount = roundToTwoDecimals(cgstAmount + sgstAmount);

  // 4. Service Charge
  const serviceChargeAmount = roundToTwoDecimals((taxableAmount * serviceChargePercent) / 100);

  // 5. Total before round-off
  const rawTotal = taxableAmount + taxAmount + serviceChargeAmount + tipAmount;

  // 6. Round off
  const { roundedTotal, roundOff } = calculateRoundOff(rawTotal);

  return {
    items,
    subtotal,
    discountAmount,
    appliedCoupon: coupon || undefined,
    cgstAmount,
    sgstAmount,
    taxAmount,
    serviceChargeAmount,
    tipAmount,
    roundOffAmount: roundOff,
    totalPayable: roundedTotal
  };
}
