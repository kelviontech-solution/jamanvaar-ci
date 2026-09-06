import { randomBytes, createHash } from 'crypto';

/** A cryptographically random, URL-safe opaque token — used for one-time invitation/activation credentials. */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** sha256 hex digest — only the hash is ever persisted, matching the refresh-token storage pattern. */
export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
