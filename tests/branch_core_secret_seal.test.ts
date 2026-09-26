import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openSecret, sealSecret } from '../packages/branch-core/src/secret-seal';

describe('Branch Core credential sealing (F-09)', () => {
  it('does not store the token in the clear, round-trips, and still reads a pre-sealing plain value', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'core-'));
    const sealed = sealSecret(dir, 'device-token-123');
    expect(sealed).not.toContain('device-token-123');
    expect(openSecret(dir, sealed)).toBe('device-token-123');
    expect(openSecret(dir, 'legacy-plain')).toBe('legacy-plain');
  });
  it('a sealed value cannot be opened with a different key', () => {
    const a = mkdtempSync(path.join(tmpdir(), 'core-'));
    const b = mkdtempSync(path.join(tmpdir(), 'core-'));
    expect(() => openSecret(b, sealSecret(a, 'x'))).toThrow();
  });
});
