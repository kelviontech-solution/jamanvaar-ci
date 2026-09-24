import { randomBytes, createHash, createHmac } from 'crypto';

/** A cryptographically random, URL-safe opaque token — used for one-time invitation/activation credentials. */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * sha256 hex digest — only the hash is ever persisted, matching the refresh-token
 * storage pattern. Safe for HIGH-entropy inputs (this file's own `generateOpaqueToken`,
 * 256 bits) where a leaked hash still cannot be feasibly reversed. Do NOT use this for a
 * low-entropy secret such as a 6-digit OTP — use `hashLowEntropySecret` instead.
 */
export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * security-audit HIGH-01: an unkeyed hash of a LOW-entropy secret (e.g. a 6-digit
 * password-reset OTP, 10^6 possible values) can be brute-forced offline in well under a
 * second by anyone who ever reads the stored hash — which is exactly what happened when
 * `/support/search` leaked `User.passwordResetHash` to READ_ONLY platform roles. Keying
 * the hash with a server-only secret means the stored value alone is useless for
 * offline guessing even if it leaks again through some other future bug — the attacker
 * would also need the server's secret, which never leaves the process. Reuses
 * `JWT_ACCESS_SECRET` (already a required, >=32-character env var) rather than adding a
 * new one.
 */
export function hashLowEntropySecret(secret: string, serverKey: string): string {
  return createHmac('sha256', serverKey).update(secret).digest('hex');
}
