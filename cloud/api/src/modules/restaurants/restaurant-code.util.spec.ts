import { describe, it, expect } from 'vitest';
import { generateRestaurantCode, RESTAURANT_CODE_RE } from './restaurant-code.util';

describe('generateRestaurantCode', () => {
  it('prefixes a normalized 10-digit mobile with JM', () => {
    expect(generateRestaurantCode('9876543210')).toBe('JM9876543210');
  });
  it('normalizes +91/spacing before prefixing', () => {
    expect(generateRestaurantCode('+91 98765 43210')).toBe('JM9876543210');
  });
  it('throws on an invalid mobile number', () => {
    expect(() => generateRestaurantCode('12345')).toThrow();
  });
});

describe('RESTAURANT_CODE_RE', () => {
  it('matches the generated format', () => {
    expect(RESTAURANT_CODE_RE.test('JM9876543210')).toBe(true);
  });
  it('rejects a lowercase or malformed code', () => {
    expect(RESTAURANT_CODE_RE.test('jm9876543210')).toBe(false);
    expect(RESTAURANT_CODE_RE.test('JM987654321')).toBe(false); // 9 digits
    expect(RESTAURANT_CODE_RE.test('JM98765432100')).toBe(false); // 11 digits
  });
});
