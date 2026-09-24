import { BadRequestException } from '@nestjs/common';
import { isValidIndianPhone, normalizeIndianPhone } from '../../common/validation/phone';

export const RESTAURANT_CODE_PREFIX = 'JM';
export const RESTAURANT_CODE_RE = /^JM[6-9][0-9]{9}$/;

/**
 * `JM` + the registered mobile, normalized to a bare 10-digit number — the customer-facing
 * Restaurant ID (spec section 3). Deliberately derived only at the call site (creation or
 * backfill), never recomputed later: a restaurant's mobile changing must NOT change its code,
 * so nothing here is wired to run automatically on a phone-number update.
 */
export function generateRestaurantCode(mobile: string): string {
  if (!isValidIndianPhone(mobile)) {
    throw new BadRequestException('A valid 10-digit Indian mobile number is required to generate a Restaurant ID');
  }
  return `${RESTAURANT_CODE_PREFIX}${normalizeIndianPhone(mobile)}`;
}
