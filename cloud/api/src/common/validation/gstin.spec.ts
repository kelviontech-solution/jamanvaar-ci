import { describe, it, expect } from 'vitest';
import { isValidGstinFormat, isValidFssaiFormat, gstinStateCodeMatches, GST_STATE_CODES } from './gstin';

/**
 * BUG-054: `gstin`/`fssaiNumber` were accepted as any trimmed string ("VVSD", "5151")
 * and ended up printed on tax invoices as-is.
 */
describe('GSTIN format', () => {
  it('accepts a well-formed GSTIN', () => {
    // 24 = Gujarat, PAN-shaped body, entity code, default 'Z', checksum char.
    expect(isValidGstinFormat('24AAACR5055K1Z1')).toBe(true);
  });

  it('rejects the wrong length, lowercase, and garbage', () => {
    expect(isValidGstinFormat('VVSD')).toBe(false);
    expect(isValidGstinFormat('JYFHJ')).toBe(false);
    expect(isValidGstinFormat('24aaacr5055k1z1')).toBe(false);
    expect(isValidGstinFormat('24AAACR5055K1Z')).toBe(false); // 14 chars
    expect(isValidGstinFormat('')).toBe(false);
  });

  it("checks the GSTIN's state-code prefix against the restaurant's declared state", () => {
    expect(gstinStateCodeMatches('24AAACR5055K1Z1', 'Gujarat')).toBe(true);
    expect(gstinStateCodeMatches('24AAACR5055K1Z1', 'Maharashtra')).toBe(false);
    // No declared state to check against: format alone decides.
    expect(gstinStateCodeMatches('24AAACR5055K1Z1', undefined)).toBe(true);
    // Unrecognised state name: cannot contradict it, so it is not rejected on that basis alone.
    expect(gstinStateCodeMatches('24AAACR5055K1Z1', 'Neverland')).toBe(true);
  });

  it('every state code map entry is a real 2-digit GST code', () => {
    for (const code of Object.values(GST_STATE_CODES)) {
      expect(code).toMatch(/^\d{2}$/);
    }
  });
});

describe('FSSAI format', () => {
  it('accepts a 14-digit FSSAI number', () => {
    expect(isValidFssaiFormat('12345678901234')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isValidFssaiFormat('5151')).toBe(false);
    expect(isValidFssaiFormat('1234567890123')).toBe(false); // 13 digits
    expect(isValidFssaiFormat('1234567890123A')).toBe(false); // letters
    expect(isValidFssaiFormat('')).toBe(false);
  });
});
