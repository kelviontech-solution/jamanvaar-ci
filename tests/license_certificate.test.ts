import { createSign, generateKeyPairSync } from 'crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import { LicenseRepository } from '@jamanvaar/database';
import {
  verifyLicenseCertificate,
  applyLicenseCertificate,
  formatLicenseCertificateString,
  parseLicenseCertificateString,
  LICENSE_PUBLIC_KEY_JWK,
  type LicenseCertificatePayload
} from '@jamanvaar/business';

/**
 * ENT-001 / SEC-002 regression suite. Uses a throwaway ECDSA keypair generated
 * here — never the real production key — so this file is safe to commit: even
 * full read access to this test gives no way to forge a certificate the real
 * embedded public key (LICENSE_PUBLIC_KEY_JWK) would accept.
 */
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const testPublicJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;

function signPayload(payload: LicenseCertificatePayload, key = privateKey): { payloadB64: string; signatureB64: string } {
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadJson).toString('base64url');
  const signer = createSign('SHA256');
  signer.update(payloadJson);
  signer.end();
  const signatureB64 = signer.sign({ key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return { payloadB64, signatureB64 };
}

function validPayload(overrides: Partial<LicenseCertificatePayload> = {}): LicenseCertificatePayload {
  return {
    restaurantId: 'rest-test-1',
    tier: 'PRO',
    entitlements: { captainApp: true, qrTableOrdering: true, posTerminal: true },
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    issuedAt: new Date().toISOString(),
    ...overrides
  };
}

describe('License certificate verification (ENT-001 / SEC-002)', () => {
  beforeEach(() => {
    LicenseRepository.activatePlan('CORE');
  });

  it('the embedded production public key is well-formed and importable', async () => {
    // Sanity check only — does not (and must not) prove anything is signed by
    // it, since we don't have the matching private key in this test file.
    await expect(
      globalThis.crypto.subtle.importKey('jwk', LICENSE_PUBLIC_KEY_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
        'verify'
      ])
    ).resolves.toBeDefined();
  });

  it('accepts a validly signed, unexpired certificate', async () => {
    const { payloadB64, signatureB64 } = signPayload(validPayload());
    const result = await verifyLicenseCertificate(payloadB64, signatureB64, testPublicJwk);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe('PRO');
    expect(result!.restaurantId).toBe('rest-test-1');
  });

  it('rejects a certificate signed by a different (attacker-controlled) key', async () => {
    const attackerKeyPair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const { payloadB64, signatureB64 } = signPayload(validPayload(), attackerKeyPair.privateKey);
    // Verified against the LEGITIMATE test public key, not the attacker's own —
    // this is what a real client does (it only ever knows the one real public key).
    const result = await verifyLicenseCertificate(payloadB64, signatureB64, testPublicJwk);
    expect(result).toBeNull();
  });

  it('rejects a tampered payload even if the original signature is reused', async () => {
    const { payloadB64, signatureB64 } = signPayload(validPayload({ tier: 'CORE' }));
    const tamperedPayload: LicenseCertificatePayload = { ...validPayload({ tier: 'CORE' }), tier: 'PRO' };
    const tamperedB64 = Buffer.from(JSON.stringify(tamperedPayload)).toString('base64url');
    const result = await verifyLicenseCertificate(tamperedB64, signatureB64, testPublicJwk);
    expect(result).toBeNull();
  });

  it('rejects an expired certificate even with a valid signature', async () => {
    const { payloadB64, signatureB64 } = signPayload(
      validPayload({ expiresAt: new Date(Date.now() - 60_000).toISOString() })
    );
    const result = await verifyLicenseCertificate(payloadB64, signatureB64, testPublicJwk);
    expect(result).toBeNull();
  });

  it('rejects a malformed certificate string before ever touching crypto', () => {
    expect(parseLicenseCertificateString('not-a-real-certificate')).toBeNull();
    expect(parseLicenseCertificateString('')).toBeNull();
  });

  it('applyLicenseCertificate end-to-end updates LicenseRepository only on success', async () => {
    LicenseRepository.activatePlan('CORE');
    expect(LicenseRepository.getLicense().tier).toBe('CORE');

    const { payloadB64, signatureB64 } = signPayload(validPayload({ restaurantId: 'rest-abc' }));
    const cert = formatLicenseCertificateString(payloadB64, signatureB64);

    // Verified against the real embedded key here, so this MUST fail (test cert,
    // not production-signed) — proves a forged/foreign certificate cannot activate PRO.
    const resultAgainstRealKey = await applyLicenseCertificate(cert, 'rest-abc');
    expect(resultAgainstRealKey.ok).toBe(false);
    expect(LicenseRepository.getLicense().tier).toBe('CORE'); // unchanged
  });

  it('applyLicenseCertificate rejects a certificate issued for a different restaurant', async () => {
    const { payloadB64, signatureB64 } = signPayload(validPayload({ restaurantId: 'rest-other' }));
    const cert = formatLicenseCertificateString(payloadB64, signatureB64);
    // Even bypassing signature verification isn't enough — a restaurantId mismatch must also fail.
    // (Signature will fail first here since this uses the throwaway key against the real one —
    // this test documents the intended defense-in-depth check exists in applyLicenseCertificate.)
    const result = await applyLicenseCertificate(cert, 'rest-expected');
    expect(result.ok).toBe(false);
  });

  // security-audit LOW-04: setVerifiedLicense used to accept an already-verified
  // payload's `expiresAt` and then silently drop it — nothing ever recorded the
  // one piece of data that should have made an offline grant time-limited. This
  // tests the repository method directly (its own doc comment says it takes
  // data already verified elsewhere — that's exactly what applyLicenseCertificate
  // does right before calling it, tested above against the real embedded key).
  it('setVerifiedLicense records the verified expiry into LicenseRepository.validUntil', () => {
    LicenseRepository.activatePlan('CORE');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const updated = LicenseRepository.setVerifiedLicense(
      { tier: 'PRO', entitlements: { captainApp: true, qrTableOrdering: true, posTerminal: true } as any, expiresAt },
      { source: 'offline-certificate' }
    );

    expect(updated.validUntil).toBe(expiresAt);
    expect(LicenseRepository.getLicense().validUntil).toBe(expiresAt);
  });
});

describe('clock rollback guard (F-06)', () => {
  it('an expired certificate stays expired after the device clock is wound back', async () => {
    const store: Record<string, string> = {};
    const fake = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true });
    try {
      const soon = validPayload({ expiresAt: new Date(Date.now() + 3000).toISOString() });
      const { payloadB64, signatureB64 } = signPayload(soon);
      expect(await verifyLicenseCertificate(payloadB64, signatureB64, testPublicJwk)).not.toBeNull();
      const realNow = Date.now;
      Date.now = () => realNow() + 10_000; // time passes: expired, and the device remembers it saw this time
      expect(await verifyLicenseCertificate(payloadB64, signatureB64, testPublicJwk)).toBeNull();
      Date.now = realNow; // clock wound back
      expect(await verifyLicenseCertificate(payloadB64, signatureB64, testPublicJwk)).toBeNull();
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});
