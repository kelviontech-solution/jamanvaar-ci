import { describe, it, expect } from 'vitest';
import { secureRandomIndex, generateSecurePassword, generateSecureCode } from '@jamanvaar/utils';

/**
 * Found while chasing an unrelated PIN-hashing fix (B2-014): `secureRandomIndex` did single-byte
 * rejection sampling unconditionally. A single byte only has 256 possible values, so for any
 * `exclusiveMax > 256` the rejection threshold (`256 - (256 % exclusiveMax)`) computed to exactly
 * 0 — every draw was rejected, forever. `generateUniquePin`'s 10,000-entry Fisher-Yates shuffle
 * (`packages/database/src/pin.ts`) calls this with values up to 10,000 on every PIN issuance, so
 * this was a real, reachable infinite loop: it hung a live process at 100% CPU for 29+ minutes
 * before it was caught (a test run for an unrelated fix that simply never completed).
 */
describe('secureRandomIndex', () => {
  it('does not hang for a large exclusiveMax (previously an infinite loop above 256)', () => {
    const t0 = Date.now();
    for (let i = 0; i < 1000; i++) {
      const v = secureRandomIndex(10000);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10000);
    }
    expect(Date.now() - t0).toBeLessThan(5000);
  });

  it('stays correct and fast for a small exclusiveMax (the pre-existing, previously-only-tested path)', () => {
    for (let i = 0; i < 1000; i++) {
      const v = secureRandomIndex(14);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(14);
    }
  });

  it('exclusiveMax of exactly 1 always returns 0', () => {
    for (let i = 0; i < 10; i++) expect(secureRandomIndex(1)).toBe(0);
  });

  it('rejects a non-positive or non-integer exclusiveMax instead of looping forever on it', () => {
    expect(() => secureRandomIndex(0)).toThrow();
    expect(() => secureRandomIndex(-5)).toThrow();
    expect(() => secureRandomIndex(2.5)).toThrow();
  });

  it('produces a roughly uniform distribution across a range that needs 2 bytes internally', () => {
    const counts = new Array(1000).fill(0);
    for (let i = 0; i < 200_000; i++) counts[secureRandomIndex(1000)]++;
    // Expected ~200 hits per bucket; a real bias (e.g. an off-by-one in the byte-width math)
    // would show up as buckets pinned at 0 or wildly over-represented, not just noise.
    expect(Math.min(...counts)).toBeGreaterThan(100);
    expect(Math.max(...counts)).toBeLessThan(320);
  });
});

describe('other secure-random generators still work (sanity, unaffected by the secureRandomIndex fix)', () => {
  it('generateSecurePassword produces a strong password of the requested length', () => {
    const pw = generateSecurePassword(14);
    expect(pw).toHaveLength(14);
    expect(pw).toMatch(/[a-z]/);
    expect(pw).toMatch(/[A-Z]/);
    expect(pw).toMatch(/[0-9]/);
  });

  it('generateSecureCode produces a code from the given charset', () => {
    const code = generateSecureCode(8, 'ABCDEFGH');
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[ABCDEFGH]+$/);
  });
});
