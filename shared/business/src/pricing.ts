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
export function calculateItemTotal(
  basePrice: number,
  quantity: number,
  modifiers: SelectedModifier[] = []
): number {
  const unitPrice = calculateItemUnitPrice(basePrice, modifiers);
  return roundToTwoDecimals(unitPrice * quantity);
}

/**
 * Calculates complete item total with optional item-level discount
 */
export function calculateItemDiscountedTotal(
  basePrice: number,
  quantity: number,
  modifiers: SelectedModifier[] = [],
  itemDiscountPercent: number = 0,
  itemDiscountFlat: number = 0
): { rawTotal: number; discountAmount: number; finalTotal: number } {
  const unitPrice = calculateItemUnitPrice(basePrice, modifiers);
  const rawTotal = roundToTwoDecimals(unitPrice * quantity);

  let discountAmount = 0;
  if (itemDiscountPercent > 0) {
    const validPct = Math.min(100, Math.max(0, itemDiscountPercent));
    discountAmount = roundToTwoDecimals((rawTotal * validPct) / 100);
  } else if (itemDiscountFlat > 0) {
    discountAmount = roundToTwoDecimals(Math.min(rawTotal, Math.max(0, itemDiscountFlat)));
  }

  const finalTotal = roundToTwoDecimals(Math.max(0, rawTotal - discountAmount));
  return { rawTotal, discountAmount, finalTotal };
}

export interface CalculateCartOptions {
  items: CartItem[];
  coupon?: Coupon | null;
  discountType?: 'PERCENTAGE' | 'FIXED' | 'COUPON' | 'NONE';
  discountValue?: number;
  discountScope?: 'BILL' | 'ITEMS';
  discountReason?: string;
  discountCode?: string;
  cgstPercent?: number;
  sgstPercent?: number;
  serviceChargePercent?: number;
  tipAmount?: number;
}

/**
 * Calculates authoritative cart financial breakdown:
 * - Subtotal
 * - Item-Level & Bill-Level Discount
 * - Taxable Turnover
 * - CGST & SGST (Standard 5% Restaurant GST or configured)
 * - Service Charge / Tips
 * - Round Off
 * - Total Payable
 */
export function calculateCart(options: CalculateCartOptions): Cart {
  const {
    items,
    coupon = null,
    discountType = 'NONE',
    discountValue = 0,
    discountScope = 'BILL',
    discountReason,
    discountCode,
    cgstPercent = APP_CONSTANTS.DEFAULT_CGST_PERCENT,
    sgstPercent = APP_CONSTANTS.DEFAULT_SGST_PERCENT,
    serviceChargePercent = 0,
    tipAmount = 0
  } = options;

  // 1. Calculate raw Subtotal and item-level discounts
  let rawSubtotal = 0;
  let totalItemDiscounts = 0;

  const processedItems: CartItem[] = items.map((it) => {
    const unitPrice = calculateItemUnitPrice(it.item.price, it.selectedModifiers);
    const lineRawTotal = roundToTwoDecimals(unitPrice * (it.quantity || 1));
    rawSubtotal += lineRawTotal;

    let lineDiscount = 0;
    if (it.itemDiscountPercent && it.itemDiscountPercent > 0) {
      const validPct = Math.min(100, Math.max(0, it.itemDiscountPercent));
      lineDiscount = roundToTwoDecimals((lineRawTotal * validPct) / 100);
    } else if (it.itemDiscountAmount && it.itemDiscountAmount > 0) {
      lineDiscount = roundToTwoDecimals(Math.min(lineRawTotal, Math.max(0, it.itemDiscountAmount)));
    }

    totalItemDiscounts += lineDiscount;

    return {
      ...it,
      unitPrice,
      itemTotal: lineRawTotal,
      itemDiscountAmount: lineDiscount
    };
  });

  const subtotal = roundToTwoDecimals(rawSubtotal);

  // 2. Evaluate Bill-Level Discount or Coupon
  let totalDiscountAmount = 0;

  if (discountScope === 'ITEMS') {
    totalDiscountAmount = roundToTwoDecimals(totalItemDiscounts);
  } else {
    // Bill-Level Discount
    if (discountType === 'PERCENTAGE' && discountValue > 0) {
      const validPct = Math.min(100, Math.max(0, discountValue));
      totalDiscountAmount = roundToTwoDecimals((subtotal * validPct) / 100);
    } else if (discountType === 'FIXED' && discountValue > 0) {
      totalDiscountAmount = roundToTwoDecimals(Math.min(subtotal, Math.max(0, discountValue)));
    } else if (coupon && coupon.isActive) {
      if (subtotal >= coupon.minOrderValue) {
        if (coupon.discountType === 'PERCENTAGE') {
          const rawDiscount = (subtotal * coupon.discountValue) / 100;
          totalDiscountAmount = coupon.maxDiscountAmount
            ? Math.min(rawDiscount, coupon.maxDiscountAmount)
            : rawDiscount;
        } else {
          totalDiscountAmount = Math.min(coupon.discountValue, subtotal);
        }
        totalDiscountAmount = roundToTwoDecimals(totalDiscountAmount);
      }
    }
  }

  // Ensure discount does not exceed subtotal and is never negative
  totalDiscountAmount = roundToTwoDecimals(Math.max(0, Math.min(subtotal, totalDiscountAmount)));
  const taxableAmount = roundToTwoDecimals(Math.max(0, subtotal - totalDiscountAmount));

  // 3. Tax calculations (CGST + SGST on taxable amount)
  const cgstAmount = roundToTwoDecimals((taxableAmount * cgstPercent) / 100);
  const sgstAmount = roundToTwoDecimals((taxableAmount * sgstPercent) / 100);
  const taxAmount = roundToTwoDecimals(cgstAmount + sgstAmount);

  // 4. Service Charge
  const serviceChargeAmount = roundToTwoDecimals((taxableAmount * serviceChargePercent) / 100);

  // 5. Total before round-off
  const rawTotal = roundToTwoDecimals(taxableAmount + taxAmount + serviceChargeAmount + tipAmount);

  // 6. Round off
  const { roundedTotal, roundOff } = calculateRoundOff(rawTotal);

  return {
    items: processedItems,
    subtotal,
    discountAmount: totalDiscountAmount,
    discountType,
    discountValue,
    discountScope,
    discountReason,
    discountCode: discountCode || (coupon ? coupon.code : undefined),
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
