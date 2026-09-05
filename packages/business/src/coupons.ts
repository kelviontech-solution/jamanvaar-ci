import { Coupon } from '@jamanvaar/types';
import { roundToTwoDecimals } from '@jamanvaar/utils';

export interface CouponValidationResult {
  isValid: boolean;
  discountAmount: number;
  message?: string;
}

export function validateCoupon(
  coupon: Coupon,
  cartSubtotal: number,
  customerOrdersCount: number = 0
): CouponValidationResult {
  const now = new Date().toISOString();

  if (!coupon.isActive) {
    return { isValid: false, discountAmount: 0, message: 'This coupon is inactive.' };
  }

  if (coupon.validFrom && now < coupon.validFrom) {
    return { isValid: false, discountAmount: 0, message: 'This coupon is not valid yet.' };
  }

  if (coupon.validUntil && now > coupon.validUntil) {
    return { isValid: false, discountAmount: 0, message: 'This coupon has expired.' };
  }

  if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
    return { isValid: false, discountAmount: 0, message: 'This coupon usage limit has been reached.' };
  }

  if (coupon.perCustomerLimit && customerOrdersCount >= coupon.perCustomerLimit) {
    return { isValid: false, discountAmount: 0, message: 'You have reached the usage limit for this coupon.' };
  }

  if (cartSubtotal < coupon.minOrderValue) {
    return {
      isValid: false,
      discountAmount: 0,
      message: `Minimum order amount of ₹${coupon.minOrderValue} required for this coupon.`
    };
  }

  let discount = 0;
  if (coupon.discountType === 'PERCENTAGE') {
    const raw = (cartSubtotal * coupon.discountValue) / 100;
    discount = coupon.maxDiscountAmount ? Math.min(raw, coupon.maxDiscountAmount) : raw;
  } else {
    discount = Math.min(coupon.discountValue, cartSubtotal);
  }

  return {
    isValid: true,
    discountAmount: roundToTwoDecimals(discount),
    message: `Coupon applied: ₹${roundToTwoDecimals(discount)} off!`
  };
}
