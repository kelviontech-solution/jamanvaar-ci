import { describe, it, expect } from 'vitest';
import { hashPin, verifyPinHash, isPlaintextPin, generateUniquePin } from '@jamanvaar/database';

/**
 * BUG-005/006/009/011: PINs used to be plaintext (`User.pinCode === '1234'`), compared
 * directly by every login screen. Restaurant Admin also had no way to issue one at all.
 * This is the shared hashing/generation logic behind StaffRepository's PIN issuance.
 */
describe('staff PIN hashing', () => {
  it('hashes a PIN deterministically, and a matching PIN verifies', () => {
    const hash = hashPin('4821', 'rest-1');
    expect(hash).not.toContain('4821');
    expect(verifyPinHash('4821', 'rest-1', hash)).toBe(true);
  });

  it('rejects the wrong PIN', () => {
    const hash = hashPin('4821', 'rest-1');
    expect(verifyPinHash('9999', 'rest-1', hash)).toBe(false);
  });

  it('the same PIN hashes differently per restaurant', () => {
    expect(hashPin('4821', 'rest-1')).not.toBe(hashPin('4821', 'rest-2'));
  });

  it('rejects a PIN verified against no stored hash at all', () => {
    expect(verifyPinHash('4821', 'rest-1', undefined)).toBe(false);
  });

  /**
   * security-audit MED-05: hashPin now produces a much more expensive `pinv2` hash, but
   * an existing install's already-stored `pinv1` hashes (computed with the old, weaker
   * 2-round scheme) must keep verifying — nobody's PIN should stop working just because
   * this shipped. `pinv1` support is verification-only; a freshly hashed PIN is always
   * `pinv2` going forward.
   */
  it('still verifies a PIN against a hash computed with the old (v1) algorithm', () => {
    // A hand-computed v1 hash for PIN '4821' at restaurant 'rest-1', frozen here rather
    // than regenerated, so this test would actually fail if v1 support were ever removed.
    const legacyV1Hash = 'pinv1:' +
      (() => {
        function fnv1a(input: string): number {
          let hash = 0x811c9dc5;
          for (let i = 0; i < input.length; i++) {
            hash ^= input.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
          }
          return hash >>> 0;
        }
        const salted = 'rest-1:4821:jamanvaar-pin';
        const a = fnv1a(salted);
        const b = fnv1a(`${a.toString(16)}:${salted}`);
        return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
      })();

    expect(verifyPinHash('4821', 'rest-1', legacyV1Hash)).toBe(true);
    expect(verifyPinHash('9999', 'rest-1', legacyV1Hash)).toBe(false);
    expect(isPlaintextPin(legacyV1Hash)).toBe(false);

    // A freshly issued hash for the same PIN is the new, stronger v2 format.
    expect(hashPin('4821', 'rest-1').startsWith('pinv2:')).toBe(true);
  });

  it('flags an old plaintext PIN so callers can detect and migrate it', () => {
    expect(isPlaintextPin('1234')).toBe(true);
    expect(isPlaintextPin(hashPin('1234', 'rest-1'))).toBe(false);
    expect(isPlaintextPin(undefined)).toBe(false);
  });

  it('generates a PIN whose hash is not already taken', () => {
    const existing = [hashPin('1111', 'rest-1'), hashPin('2222', 'rest-1')];
    const pin = generateUniquePin('rest-1', existing);
    expect(pin).toMatch(/^\d{4}$/);
    expect(existing).not.toContain(hashPin(pin, 'rest-1'));
  });

  it('avoids weak/obvious PINs (0000, 1111, 1234...) while any non-weak PIN remains', () => {
    for (let i = 0; i < 20; i++) {
      const pin = generateUniquePin('rest-1', []);
      expect(['0000', '1111', '1234', '1212', '0001']).not.toContain(pin);
    }
  });

  it('still returns a weak PIN rather than throwing once only weak ones are left', () => {
    const all = [];
    for (let n = 0; n < 10000; n++) all.push(String(n).padStart(4, '0'));
    const nonWeak = all.filter((p) => !['0000', '1111', '1234', '1212', '0001'].includes(p));
    const takenHashes = nonWeak.map((p) => hashPin(p, 'rest-1'));
    const pin = generateUniquePin('rest-1', takenHashes);
    expect(['0000', '1111', '1234', '1212', '0001']).toContain(pin);
    // security-audit MED-05: hashPin is intentionally stretched now, so this
    // pathological "restaurant with ~10,000 PINs already issued" fixture takes real
    // wall-clock time to build (~9999 hashPin calls) — a longer timeout for this one
    // rare edge-case test, not a statement about normal (single-hash) responsiveness.
  }, 20_000);

  it('throws only when truly every PIN (weak included) is taken', () => {
    const all: string[] = [];
    for (let n = 0; n < 10000; n++) all.push(hashPin(String(n).padStart(4, '0'), 'rest-1'));
    expect(() => generateUniquePin('rest-1', all)).toThrow();
  }, 20_000);
});
