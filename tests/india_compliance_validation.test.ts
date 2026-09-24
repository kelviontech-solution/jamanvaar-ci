import { describe, it, expect } from 'vitest';
import { isValidGstinFormat, isValidFssaiFormat, isValidIndianPincode, isValidIndianPhone, normalizeIndianPhone } from '@jamanvaar/utils';

/**
 * B2-040: Restaurant Settings (and Kiosk Admin's own Receipt Settings / Restaurant Profile
 * screens) saved GSTIN "abc", FSSAI "12", pincode "xx" and phone "not-a-phone" with no format
 * check at all, and copied them straight onto real customer receipts.
 */
describe('B2-040: GSTIN/FSSAI/pincode/phone format validation', () => {
  it('rejects the exact live-confirmed invalid values', () => {
    expect(isValidGstinFormat('abc')).toBe(false);
    expect(isValidFssaiFormat('12')).toBe(false);
    expect(isValidIndianPincode('xx')).toBe(false);
    expect(isValidIndianPhone('not-a-phone')).toBe(false);
  });

  it('accepts well-formed values', () => {
    expect(isValidGstinFormat('24AAACR5055K1Z1')).toBe(true);
    expect(isValidGstinFormat('24aaacr5055k1z1')).toBe(true); // case-insensitive input
    expect(isValidFssaiFormat('10722001000452')).toBe(true);
    expect(isValidIndianPincode('380054')).toBe(true);
    expect(isValidIndianPhone('+91 79 4890 1234')).toBe(true);
    expect(isValidIndianPhone('9825012345')).toBe(true);
    expect(isValidIndianPhone('079-48901234')).toBe(false); // landline STD-code format isn't a 10-digit mobile — correctly rejected
  });

  it('rejects a pincode starting with 0 (not a real Indian PIN code) and a non-10-digit phone', () => {
    expect(isValidIndianPincode('012345')).toBe(false);
    expect(isValidIndianPhone('12345')).toBe(false);
    expect(isValidIndianPhone('12345678901')).toBe(false);
  });

  it('a GSTIN or FSSAI number one character short or long is rejected', () => {
    expect(isValidGstinFormat('24AAACR5055K1Z')).toBe(false); // 14 chars
    expect(isValidGstinFormat('24AAACR5055K1Z11')).toBe(false); // 16 chars
    expect(isValidFssaiFormat('1072200100045')).toBe(false); // 13 digits
    expect(isValidFssaiFormat('107220010004522')).toBe(false); // 15 digits
  });
});

describe('B2-043: normalizeIndianPhone', () => {
  it('strips a +91/91 country code and non-digit separators, leaving a bare 10-digit number', () => {
    expect(normalizeIndianPhone('+91 92222 22223')).toBe('9222222223');
    expect(normalizeIndianPhone('+919222222223')).toBe('9222222223');
    expect(normalizeIndianPhone('919222222223')).toBe('9222222223');
    expect(normalizeIndianPhone('9222222223')).toBe('9222222223');
    expect(normalizeIndianPhone('92222-22223')).toBe('9222222223');
  });

  it('strips a leading 0 from an 11-digit input', () => {
    expect(normalizeIndianPhone('09222222223')).toBe('9222222223');
  });

  it('leaves obviously non-phone text as digits-only (empty for pure letters), not throwing', () => {
    expect(normalizeIndianPhone('Letters')).toBe('');
    expect(normalizeIndianPhone('123')).toBe('123');
  });
});
