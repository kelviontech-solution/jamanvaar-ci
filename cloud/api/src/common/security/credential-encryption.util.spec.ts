import { randomBytes } from 'crypto';
import { describe, it, expect } from 'vitest';
import { encryptCredential, decryptCredential } from './credential-encryption.util';

describe('credential-encryption.util', () => {
  const key = randomBytes(32).toString('base64');

  it('round-trips plaintext exactly', () => {
    const encrypted = encryptCredential('1234567890', key);
    expect(decryptCredential(encrypted, key)).toBe('1234567890');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encryptCredential('same-value', key);
    const b = encryptCredential('same-value', key);
    expect(a).not.toBe(b);
  });

  it('rejects a tampered ciphertext', () => {
    const encrypted = encryptCredential('secret', key);
    const [iv, tag] = encrypted.split(':');
    const tampered = `${iv}:${tag}:${Buffer.from('tampered-bytes').toString('base64')}`;
    expect(() => decryptCredential(tampered, key)).toThrow();
  });

  it('rejects decryption with the wrong key', () => {
    const encrypted = encryptCredential('secret', key);
    const wrongKey = randomBytes(32).toString('base64');
    expect(() => decryptCredential(encrypted, wrongKey)).toThrow();
  });

  it('rejects a key that does not decode to 32 bytes', () => {
    expect(() => encryptCredential('x', Buffer.from('too-short').toString('base64'))).toThrow(
      'Encryption key must decode to exactly 32 bytes'
    );
  });
});
