import { LICENSE_PUBLIC_KEYS, type LicensePublicKey } from '@jamanvaar/config';

/**
 * Checks an emergency offline extension the cloud signed (BUG-077). Verified locally with the public
 * keys built into the app, so it works with no connection, and nobody can forge or lengthen one.
 * Returns the trustworthy payload, or null for anything else (bad signature, expired, wrong type).
 */
export interface OfflineExtensionPayload {
  type: 'EMERGENCY_OFFLINE_EXTENSION';
  restaurantId: string;
  branchId: string | null;
  deviceId: string | null;
  extensionDays: number;
  validFrom: string;
  validUntil: string;
  kid?: string;
  reason?: string;
}

function b64urlToBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  const binary = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function verifyWith(jwk: JsonWebKey, signature: Uint8Array<ArrayBuffer>, payload: Uint8Array<ArrayBuffer>): Promise<boolean> {
  const key = await globalThis.crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  return globalThis.crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, payload);
}

export async function verifyOfflineExtension(
  payloadB64: string,
  signatureB64: string,
  options: { keys?: LicensePublicKey[]; now?: Date } = {}
): Promise<OfflineExtensionPayload | null> {
  try {
    const keys = options.keys ?? LICENSE_PUBLIC_KEYS;
    const payloadBytes = b64urlToBytes(payloadB64);
    const signature = b64urlToBytes(signatureB64);
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as OfflineExtensionPayload;

    // The key the certificate names first; if it names none, or one we do not have, try them all.
    const named = keys.filter((k) => k.kid === payload.kid);
    const candidates = named.length ? named : keys;
    let valid = false;
    for (const k of candidates) {
      if (await verifyWith(k.jwk, signature, payloadBytes)) {
        valid = true;
        break;
      }
    }
    if (!valid) return null;

    if (payload.type !== 'EMERGENCY_OFFLINE_EXTENSION' || !payload.restaurantId || !payload.validUntil) return null;
    if (new Date(payload.validUntil).getTime() <= (options.now ?? new Date()).getTime()) return null;
    return payload;
  } catch {
    return null;
  }
}
