import { describe, it, expect } from 'vitest';
import { isValidIndianPhone, normalizeIndianPhone } from './phone';

describe('isValidIndianPhone', () => {
  it('accepts a bare 10-digit mobile starting 6-9', () => {
    expect(isValidIndianPhone('9876543210')).toBe(true);
  });
  it('accepts +91 and spacing/dash variants', () => {
    expect(isValidIndianPhone('+91 98765 43210')).toBe(true);
    expect(isValidIndianPhone('091-9876543210'.slice(1))).toBe(true); // '91-9876543210'
  });
  it('rejects a number starting 0-5', () => {
    expect(isValidIndianPhone('1234567890')).toBe(false);
  });
  it('rejects the wrong length', () => {
    expect(isValidIndianPhone('98765432')).toBe(false);
    expect(isValidIndianPhone('987654321099')).toBe(false);
  });
});

describe('normalizeIndianPhone', () => {
  it('strips a +91 country code', () => {
    expect(normalizeIndianPhone('+91 98765 43210')).toBe('9876543210');
  });
  it('strips a leading 0 (STD-style)', () => {
    expect(normalizeIndianPhone('09876543210')).toBe('9876543210');
  });
  it('strips spaces and dashes with no country code', () => {
    expect(normalizeIndianPhone('98765-43210')).toBe('9876543210');
  });
});
