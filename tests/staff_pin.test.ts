import { describe, it, expect } from 'vitest';
import { hashPin, verifyPinHash, isPlaintextPin, generateUniquePin, pinFingerprint } from '@jamanvaar/database';

/**
 * BUG-005/006/009/011, B2-014: PINs used to be plaintext (`User.pinCode === '1234'`), compared
 * directly by every login screen. Then hashed with a fast, non-cryptographic, fixed-salt FNV-1a
 * (reversible in milliseconds for the whole 10,000-PIN keyspace — B2-014). Now PBKDF2-HMAC-SHA256
 * with a random per-hash salt, async (Web Crypto). This is the shared hashing/generation logic
 * behind StaffRepository's PIN issuance.
 */
describe('staff PIN hashing', () => {
  it('hashes a PIN and a matching PIN verifies', async () => {
    const hash = await hashPin('4821', 'rest-1');
    expect(hash).not.toContain('4821');
    expect(hash.startsWith('pinv2:')).toBe(true);
    expect(await verifyPinHash('4821', 'rest-1', hash)).toBe(true);
  });

  it('rejects the wrong PIN', async () => {
    const hash = await hashPin('4821', 'rest-1');
    expect(await verifyPinHash('9999', 'rest-1', hash)).toBe(false);
  });

  it('the same PIN hashes to a different value each time (random salt) but both verify', async () => {
    const a = await hashPin('4821', 'rest-1');
    const b = await hashPin('4821', 'rest-1');
    expect(a).not.toBe(b);
    expect(await verifyPinHash('4821', 'rest-1', a)).toBe(true);
    expect(await verifyPinHash('4821', 'rest-1', b)).toBe(true);
  });

  it('the same PIN does not verify against a hash issued for a different restaurant', async () => {
    const hash = await hashPin('4821', 'rest-1');
    expect(await verifyPinHash('4821', 'rest-2', hash)).toBe(false);
  });

  it('rejects a PIN verified against no stored hash at all', async () => {
    expect(await verifyPinHash('4821', 'rest-1', undefined)).toBe(false);
  });

  it('still verifies a legacy pinv1 (pre-B2-014) hash — old PINs keep working', async () => {
    // Reproduces the exact legacy algorithm inline (two FNV-1a rounds over a fixed public salt)
    // rather than importing it, since it is deliberately no longer exported for new use.
    function fnv1a(input: string): number {
      let hash = 0x811c9dc5;
      for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
      }
      return hash >>> 0;
    }
    const salted = `rest-1:4821:jamanvaar-pin`;
    const a = fnv1a(salted);
    const b = fnv1a(`${a.toString(16)}:${salted}`);
    const legacyHash = 'pinv1:' + a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
    expect(await verifyPinHash('4821', 'rest-1', legacyHash)).toBe(true);
    expect(await verifyPinHash('9999', 'rest-1', legacyHash)).toBe(false);
  });

  it('flags an old plaintext PIN so callers can detect and migrate it', async () => {
    expect(isPlaintextPin('1234')).toBe(true);
    expect(isPlaintextPin(await hashPin('1234', 'rest-1'))).toBe(false);
    expect(isPlaintextPin('pinv1:deadbeefdeadbeef')).toBe(false);
    expect(isPlaintextPin(undefined)).toBe(false);
  });

  it('generates a PIN whose fingerprint is not already taken', () => {
    const existing = [pinFingerprint('1111', 'rest-1'), pinFingerprint('2222', 'rest-1')];
    const pin = generateUniquePin('rest-1', existing);
    expect(pin).toMatch(/^\d{4}$/);
    expect(existing).not.toContain(pinFingerprint(pin, 'rest-1'));
  });

  it('avoids weak/obvious PINs (0000, 1111, 1234...) while any non-weak PIN remains', () => {
    for (let i = 0; i < 20; i++) {
      const pin = generateUniquePin('rest-1', []);
      expect(['0000', '1111', '1234', '1212', '0001']).not.toContain(pin);
    }
  });

  it('avoids the broader class of obvious patterns too: any repeating digit and any 4-in-a-row ascending/descending run', () => {
    const obvious = ['2222', '3333', '9999', '0123', '2345', '6789', '9876', '5432', '3210'];
    for (let i = 0; i < 40; i++) {
      const pin = generateUniquePin('rest-1', []);
      expect(obvious).not.toContain(pin);
    }
  });

  it('still returns a weak PIN rather than throwing once only weak ones are left', () => {
    const all = [];
    for (let n = 0; n < 10000; n++) all.push(String(n).padStart(4, '0'));
    const nonWeak = all.filter((p) => !['0000', '1111', '1234', '1212', '0001'].includes(p));
    const takenFingerprints = nonWeak.map((p) => pinFingerprint(p, 'rest-1'));
    const pin = generateUniquePin('rest-1', takenFingerprints);
    expect(['0000', '1111', '1234', '1212', '0001']).toContain(pin);
  });

  it('throws only when truly every PIN (weak included) is taken', () => {
    const all: string[] = [];
    for (let n = 0; n < 10000; n++) all.push(pinFingerprint(String(n).padStart(4, '0'), 'rest-1'));
    expect(() => generateUniquePin('rest-1', all)).toThrow();
  });
});
