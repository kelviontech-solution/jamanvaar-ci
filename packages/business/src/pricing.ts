import { Cart, CartItem, Coupon, MenuItem, SelectedModifier, TaxGroup } from '@jamanvaar/types';
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
  /** When supplied, only the item's active configured tax group is charged; unassigned items are untaxed. */
  taxGroups?: TaxGroup[];
  roundToRupee?: boolean;
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

  let subtotal = roundToTwoDecimals(rawSubtotal);

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
  let cgstAmount = roundToTwoDecimals((taxableAmount * cgstPercent) / 100);
  let sgstAmount = roundToTwoDecimals((taxableAmount * sgstPercent) / 100);
  let includedTax = 0;
  if (options.taxGroups !== undefined) {
    const groups = new Map(options.taxGroups.filter(g => g.isActive).map(g => [g.id, g]));
    let cgstPaise = 0, sgstPaise = 0, includedPaise = 0, allocatedDiscount = 0;
    const discountPaise = Math.round(totalDiscountAmount * 100);
    for (const [index, line] of processedItems.entries()) {
      const group = groups.get(line.item.taxGroupId ?? '');
      const grossPaise = Math.round(line.itemTotal * 100);
      const lineDiscount = discountScope === 'ITEMS' ? Math.round((line.itemDiscountAmount ?? 0) * 100)
        : index === processedItems.length - 1 ? discountPaise - allocatedDiscount
        : Math.min(discountPaise - allocatedDiscount, Math.round(discountPaise * grossPaise / Math.max(1, Math.round(rawSubtotal * 100))));
      allocatedDiscount += lineDiscount;
      const base = Math.max(0, grossPaise - lineDiscount);
      const cgstBp = Math.round((group?.cgstPercent ?? 0) * 100);
      const sgstBp = Math.round((group?.sgstPercent ?? 0) * 100);
      const rate = cgstBp + sgstBp;
      const tax = Math.round(base * rate / (10000 + (group?.isInclusive ? rate : 0)));
      line.taxSnapshot = { taxGroupId: group?.id, taxRateBp: rate, taxInclusive: group?.isInclusive === true, lineTax: tax };
      const cgst = rate ? Math.round(tax * cgstBp / rate) : 0;
      cgstPaise += cgst; sgstPaise += tax - cgst;
      if (group?.isInclusive) includedPaise += tax;
    }
    cgstAmount = cgstPaise / 100; sgstAmount = sgstPaise / 100;
    includedTax = includedPaise / 100;
    // The receipt subtotal excludes embedded tax, so subtotal − discounts + tax equals payable.
    subtotal = roundToTwoDecimals(subtotal - includedTax);
  }
  const taxAmount = roundToTwoDecimals(cgstAmount + sgstAmount);

  // 4. Service Charge
  const serviceChargeAmount = roundToTwoDecimals((taxableAmount * serviceChargePercent) / 100);

  // 5. Total before round-off
  const rawTotal = roundToTwoDecimals(taxableAmount - includedTax + taxAmount + serviceChargeAmount + tipAmount);

  // 6. Round off
  const { roundedTotal, roundOff } = options.roundToRupee === false ? { roundedTotal: rawTotal, roundOff: 0 } : calculateRoundOff(rawTotal);

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

export interface PricedOrder {
  subtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  taxAmount: number;
  roundOffAmount: number;
  totalAmount: number;
}

/**
 * Prices a dine-in order from its lines (unit price already includes any extras) using the same
 * rules as the POS cart, so a table order taken on Captain and the same dishes rung up at the counter
 * come to the same bill — CGST + SGST, then round-off to a whole rupee.
 */
export function priceOrderLines(lines: { unitPrice: number; quantity: number; menuItemId?: string }[], catalogue?: { menuItems: MenuItem[]; taxGroups: TaxGroup[] }): PricedOrder {
  const cart = calculateCart({
    items: lines.map((l) => ({ item: { price: l.unitPrice, taxGroupId: catalogue?.menuItems.find(m => m.id === l.menuItemId)?.taxGroupId }, quantity: l.quantity, selectedModifiers: [] }) as unknown as CartItem),
    ...(catalogue ? { taxGroups: catalogue.taxGroups } : {})
  });
  return {
    subtotal: cart.subtotal,
    cgstAmount: cart.cgstAmount,
    sgstAmount: cart.sgstAmount,
    taxAmount: cart.taxAmount,
    roundOffAmount: cart.roundOffAmount,
    totalAmount: cart.totalPayable
  };
}
