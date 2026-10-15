import { gcm } from '@noble/ciphers/aes';
import type { CustomerAccount } from '@jamanvaar/types';

/**
 * security-audit LOW-pos-admin-02: db.ts persisted every CustomerAccount field (phone, name,
 * email, address, DOB, anniversary, notes) as plain JSON in the local SQLite/localStorage
 * store, so anyone with direct filesystem access to a device (lost, stolen, or shared
 * terminal) could read a restaurant's full customer list without ever going through the app.
 *
 * Encrypted here with AES-256-GCM via @noble/ciphers -- an audited, zero-dependency library
 * -- rather than the Web Crypto `subtle` API this repo already uses for PIN hashing (pin.ts),
 * because @noble/ciphers is SYNCHRONOUS. db.ts's saveToStorage()/loadFromStorage() are called
 * synchronously throughout this package (every mutation -> notify() -> save, on the hot path
 * of every terminal app); `subtle.encrypt`/`decrypt` are promise-based by spec in every JS
 * runtime, so using them here would mean converting that whole synchronous persistence
 * pipeline to async -- a much larger, riskier change than this fix, and out of scope for it.
 *
 * This module is a pure crypto leaf: it takes the device key as a plain hex string from its
 * caller rather than resolving its own storage backend. db.ts owns reading/writing that key
 * through its own `ls()` (see getOrCreatePiiKeyHex there) -- the device key must be readable
 * the moment loadFromStorage() runs inside attachDurableStorage(), and KeyValueStore is a
 * separate module attached in its own step (see browser_boot.ts), not always before that
 * point; going through db's own already-correctly-ordered storage avoids depending on an
 * attachment order this package does not control. (Also avoids giving db.ts's module graph a
 * new workspace-package edge: an earlier version imported secureRandomBytes from
 * @jamanvaar/utils, which triggered an unrelated Vite/Vitest SSR module-resolution bug --
 * `kiosk_user_db.ts`'s top-level `JamanvaarDatabase.getInstanceForRole` call saw `undefined`
 * for `JamanvaarDatabase` in several already-passing tests. Confirmed by bisection to be about
 * that new cross-package edge, not about @noble/ciphers. Keeping this module free of
 * `@jamanvaar/*` imports avoids it.)
 *
 * Honest scope of what this does and doesn't close: the device key is generated once per
 * device and stored on the same disk the ciphertext itself sits on, so an attacker with full
 * read access to this exact device's entire local app-data directory could still recover both
 * and decrypt. What this DOES close is the literal exposure the finding described -- a raw
 * dump or viewer of the SQLite file / localStorage value now shows ciphertext, not plaintext
 * customer PII, for everyone else (a partial backup, a misdirected file copy, a device
 * recycler who doesn't also recover every separate storage namespace). Real protection against
 * the "attacker owns the whole device" case needs the key to live in an OS-level secure store
 * (Windows Credential Manager, Android Keystore, ...), which means native per-platform Tauri
 * code this fix does not add -- tracked as separate follow-up work, not silently assumed to
 * already be covered.
 */

const ENCRYPTED_PREFIX = 'encv1:';
export const AES_KEY_BYTES = 32; // AES-256
const GCM_NONCE_BYTES = 12; // standard/recommended AES-GCM nonce size

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

/** A fresh random AES-256 key, hex-encoded. Called by db.ts the first time a device has none. */
export function generateDeviceKeyHex(): string {
  const g: typeof globalThis & { crypto?: Crypto } = globalThis as typeof globalThis & { crypto?: Crypto };
  const bytes = new Uint8Array(AES_KEY_BYTES);
  if (g.crypto && typeof g.crypto.getRandomValues === 'function') {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytesToHex(bytes);
}

/** Encrypts the whole customer-accounts collection into one versioned ciphertext string for disk. */
export function encryptCustomerAccountsForStorage(accounts: CustomerAccount[], deviceKeyHex: string): string {
  const key = hexToBytes(deviceKeyHex);
  if (!key || key.length !== AES_KEY_BYTES) throw new Error('pii_encryption: invalid device key');
  const nonce = new Uint8Array(GCM_NONCE_BYTES);
  const g: typeof globalThis & { crypto?: Crypto } = globalThis as typeof globalThis & { crypto?: Crypto };
  if (g.crypto && typeof g.crypto.getRandomValues === 'function') g.crypto.getRandomValues(nonce);
  else for (let i = 0; i < nonce.length; i++) nonce[i] = Math.floor(Math.random() * 256);
  const plaintext = new TextEncoder().encode(JSON.stringify(accounts));
  const ciphertext = gcm(key, nonce).encrypt(plaintext);
  return `${ENCRYPTED_PREFIX}${bytesToHex(nonce)}:${bytesToHex(ciphertext)}`;
}

/**
 * Reverses encryptCustomerAccountsForStorage, given the raw text exactly as read from
 * storage (before any JSON.parse). A value with no `encv1:` prefix is legacy plaintext JSON
 * written before this fix -- parsed directly and returned as-is; the very next save migrates
 * it to ciphertext automatically via the normal saveToStorage path, the same lazy-migration
 * shape this codebase already uses for legacy plaintext PINs (see pin.ts's isPlaintextPin).
 * Anything unreadable (corrupt, wrong key, truncated) comes back as an empty list rather than
 * throwing, so one bad record can't block the rest of the app from starting.
 */
export function decodeStoredCustomerAccounts(raw: string | null, deviceKeyHex: string): CustomerAccount[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (Array.isArray(parsed)) return parsed as CustomerAccount[]; // legacy plaintext, pre-migration
  if (typeof parsed !== 'string' || !parsed.startsWith(ENCRYPTED_PREFIX)) return [];
  try {
    const [nonceHex, cipherHex] = parsed.slice(ENCRYPTED_PREFIX.length).split(':');
    const nonce = nonceHex ? hexToBytes(nonceHex) : null;
    const ciphertext = cipherHex ? hexToBytes(cipherHex) : null;
    const key = hexToBytes(deviceKeyHex);
    if (!nonce || !ciphertext || !key || key.length !== AES_KEY_BYTES) return [];
    const plaintextBytes = gcm(key, nonce).decrypt(ciphertext);
    const decoded = JSON.parse(new TextDecoder().decode(plaintextBytes));
    return Array.isArray(decoded) ? decoded : [];
  } catch {
    return [];
  }
}
