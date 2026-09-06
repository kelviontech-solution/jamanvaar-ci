/**
 * ENT-001 / SEC-002 fix: verification half of the offline license certificate
 * scheme. The matching private key lives only in cloud/api (see
 * cloud/api/src/modules/licensing/licensing.service.ts) and never ships to any
 * client — this file only holds the PUBLIC key, so extracting this bundle gives
 * an attacker nothing usable to forge a certificate with.
 *
 * Uses the Web Crypto API (globalThis.crypto.subtle) rather than Node's `crypto`
 * module so the same code runs unmodified in the browser (pos-admin, pos,
 * captain — all Vite/React bundles) and in Node test runs (Node 19+ exposes the
 * same API as a global).
 */

import { LicenseRepository } from '@jamanvaar/database';
import type { LicenseInfo, PlanTier, PlanEntitlements } from '@jamanvaar/types';

export const LICENSE_PUBLIC_KEY_JWK: JsonWebKey = {
  kty: 'EC',
  crv: 'P-256',
  x: 'cvAVNFm6l4nVknr2vjaQ21EzZby6m2bXIlG3jcWoVX0',
  y: 'bafQoC8ZaiXpkinCfXSPMJUjsqt3v0UvAbUFWZwLfsg'
};

export interface LicenseCertificatePayload {
  restaurantId: string;
  tier: string;
  entitlements: Record<string, unknown>;
  expiresAt: string;
  issuedAt: string;
}

function base64UrlToUint8Array(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  const binary = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

let cachedDefaultKey: Promise<CryptoKey> | null = null;
function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
}

/**
 * Verifies a certificate minted by cloud/api's LicensingService. Returns the
 * parsed, trustworthy payload only when the signature is valid, the payload
 * is well-formed JSON, and it has not expired — `null` in every other case.
 * Never throws; callers should treat `null` as "not entitled", not crash.
 *
 * `publicKeyJwk` defaults to the real embedded key and should only ever be
 * overridden in tests (with a throwaway keypair) — never pass a caller-supplied
 * key in production code, or verification stops proving anything.
 */
export async function verifyLicenseCertificate(
  payloadB64: string,
  signatureB64: string,
  publicKeyJwk: JsonWebKey = LICENSE_PUBLIC_KEY_JWK
): Promise<LicenseCertificatePayload | null> {
  try {
    const payloadBytes = base64UrlToUint8Array(payloadB64);
    const signatureBytes = base64UrlToUint8Array(signatureB64);
    const key = await (publicKeyJwk === LICENSE_PUBLIC_KEY_JWK
      ? (cachedDefaultKey ??= importPublicKey(publicKeyJwk))
      : importPublicKey(publicKeyJwk));

    const valid = await globalThis.crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      signatureBytes,
      payloadBytes
    );
    if (!valid) return null;

    const payloadJson = new TextDecoder().decode(payloadBytes);
    const payload = JSON.parse(payloadJson) as LicenseCertificatePayload;

    if (!payload.restaurantId || !payload.tier || !payload.expiresAt) return null;
    if (new Date(payload.expiresAt).getTime() < Date.now()) return null;

    return payload;
  } catch {
    return null;
  }
}

/** Parses the compact `<payload>.<signature>` string shown to dealers/operators back into its two parts. */
export function parseLicenseCertificateString(raw: string): { payloadB64: string; signatureB64: string } | null {
  const trimmed = raw.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { payloadB64: parts[0], signatureB64: parts[1] };
}

/** Inverse of parsing — used by Super Admin UI to present the certificate the API returns as one pasteable string. */
export function formatLicenseCertificateString(payloadB64: string, signatureB64: string): string {
  return `${payloadB64}.${signatureB64}`;
}

export type ApplyCertificateResult =
  | { ok: true; license: LicenseInfo }
  | { ok: false; reason: 'malformed' | 'invalid-signature-or-expired' | 'restaurant-mismatch' };

/**
 * The one production entry point for turning a pasted certificate string into
 * an activated local license. Verifies the signature first — LicenseRepository
 * is only ever written to with data this function has already checked.
 */
export async function applyLicenseCertificate(
  certificateString: string,
  expectedRestaurantId?: string
): Promise<ApplyCertificateResult> {
  const parsed = parseLicenseCertificateString(certificateString);
  if (!parsed) return { ok: false, reason: 'malformed' };

  const payload = await verifyLicenseCertificate(parsed.payloadB64, parsed.signatureB64);
  if (!payload) return { ok: false, reason: 'invalid-signature-or-expired' };

  if (expectedRestaurantId && payload.restaurantId !== expectedRestaurantId) {
    return { ok: false, reason: 'restaurant-mismatch' };
  }

  const license = LicenseRepository.setVerifiedLicense(
    {
      tier: payload.tier as PlanTier,
      entitlements: payload.entitlements as unknown as PlanEntitlements,
      expiresAt: payload.expiresAt
    },
    { source: 'offline-certificate' }
  );

  return { ok: true, license };
}
