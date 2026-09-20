import { generateKeyPairSync } from 'crypto';
import { describe, it, expect } from 'vitest';
import { OfflinePolicyService } from './offline-policy.service';

/**
 * BUG-076: the page only told an operator the signing key was missing AFTER they filled in and
 * submitted the dialog. The service can now say so up front, without ever revealing the key.
 */
function serviceWithKey(value: string | undefined) {
  const config = { get: (k: string) => (k === 'LICENSE_SIGNING_PRIVATE_KEY_B64' ? value : undefined) };
  return new OfflinePolicyService({} as never, config as never, {} as never);
}

describe('OfflinePolicyService.signingStatus', () => {
  it('reports not configured when the key is unset or empty', () => {
    expect(serviceWithKey(undefined).signingStatus()).toEqual({ configured: false, reason: expect.stringMatching(/not set/i) });
    expect(serviceWithKey('').signingStatus().configured).toBe(false);
  });

  it('reports a key that is set but cannot be parsed as unusable', () => {
    const r = serviceWithKey(Buffer.from('not a pem key').toString('base64')).signingStatus();
    expect(r.configured).toBe(false);
    expect(r).toMatchObject({ reason: expect.stringMatching(/valid|parse|unreadable/i) });
  });

  it('reports a real P-256 private key as configured, and never returns key material', () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const b64 = Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()).toString('base64');
    const r = serviceWithKey(b64).signingStatus();
    expect(r).toEqual({ configured: true });
    expect(JSON.stringify(r)).not.toContain(b64.slice(0, 20));
  });
});
